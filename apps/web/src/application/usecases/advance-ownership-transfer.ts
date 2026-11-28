import type { ProjectDeletionRequestRepository } from "../../domain/repositories/project-deletion-request-repository";
import type {
  OwnershipTransfer,
  ProjectOwnershipTransferRepository,
} from "../../domain/repositories/project-ownership-transfer-repository";
import type { OwnershipTransferProvider } from "../ports/ownership-transfer-provider";
import { notifyOwnershipTransferOutcomes } from "./notify-ownership-transfer-outcomes";

export type TransferAdvanceDeps = {
  transfers: ProjectOwnershipTransferRepository;
  provider: OwnershipTransferProvider;
  deletions: Pick<ProjectDeletionRequestRepository, "findById">;
};
export type PendingTransferOutcome =
  | "waiting"
  | "blocked"
  | "switched"
  | "not-switched"
  | "unavailable";

export async function reconcilePendingTransfer(
  deps: TransferAdvanceDeps,
  transfer: OwnershipTransfer,
): Promise<PendingTransferOutcome> {
  try {
    const eligibility = await deps.provider.getEligibility({
      projectId: transfer.projectId,
      transferId: transfer.id,
      previousOwnerId: transfer.fromUserId,
      recipientId: transfer.toUserId,
    });
    if (eligibility === "pending") return "waiting";
    const deletion = await deps.deletions.findById(transfer.projectId);
    if (deletion.isErr()) return "unavailable";
    const now = new Date();
    if (eligibility === "allowed" && !deletion.value) {
      const completed = await deps.transfers.complete({ id: transfer.id, now });
      if (completed.isErr()) return "unavailable";
      if (completed.value) return "switched";
      const latest = await deps.transfers.findById(transfer.id);
      if (latest.isErr() || !latest.value) return "unavailable";
      if (latest.value.status === "completed") return "switched";
      if (latest.value.status === "pending") return "blocked";
      return "not-switched";
    }
    const closed = await deps.transfers.close({
      id: transfer.id,
      status: "cancelled",
      now,
    });
    return closed.isOk() ? "not-switched" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function advanceOwnershipTransfer(
  deps: TransferAdvanceDeps,
  transfer: OwnershipTransfer,
): Promise<PendingTransferOutcome> {
  const outcome = await reconcilePendingTransfer(deps, transfer);
  if (outcome === "switched" || outcome === "not-switched") {
    await notifyOwnershipTransferOutcomes(deps);
  }
  return outcome;
}

export async function recoverOwnershipTransfers(
  deps: TransferAdvanceDeps,
  now: Date,
): Promise<{ pending: number; unnotified: number }> {
  const expired = await deps.transfers.expireOverdue(now);
  if (expired.isErr()) throw new Error("Failed to expire transfers");
  await notifyOwnershipTransferOutcomes(deps);
  const pending = await deps.transfers.listPending(now, 50);
  if (pending.isErr()) throw new Error("Failed to list transfers");
  for (const transfer of pending.value) {
    await reconcilePendingTransfer(deps, transfer);
    await deps.transfers.markAttempt(transfer.id, now);
  }
  await notifyOwnershipTransferOutcomes(deps);
  const unnotified = await deps.transfers.listUnnotifiedOutcomes(50);
  if (unnotified.isErr()) throw new Error("Failed to list transfer outcomes");
  return { pending: pending.value.length, unnotified: unnotified.value.length };
}
