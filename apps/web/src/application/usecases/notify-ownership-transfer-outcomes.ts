import type { OwnershipTransferProvider } from "../ports/ownership-transfer-provider";
import type { ProjectOwnershipTransferRepository } from "../../domain/repositories/project-ownership-transfer-repository";

export async function notifyOwnershipTransferOutcomes(
  deps: {
    transfers: ProjectOwnershipTransferRepository;
    provider: OwnershipTransferProvider;
  },
  limit = 50,
): Promise<void> {
  const pending = await deps.transfers.listUnnotifiedOutcomes(limit);
  if (pending.isErr()) throw new Error("Failed to list transfer outcomes");
  for (const transfer of pending.value) {
    try {
      if (transfer.endedAt === null || transfer.status === "pending")
        throw new Error("Transfer has no outcome");
      await deps.provider.recordOutcome({
        projectId: transfer.projectId,
        transferId: transfer.id,
        previousOwnerId: transfer.fromUserId,
        recipientId: transfer.toUserId,
        outcome: transfer.status === "completed" ? "switched" : "not-switched",
        occurredAt: transfer.endedAt,
      });
      const marked = await deps.transfers.markOutcomeNotified(transfer.id);
      if (marked.isErr())
        throw new Error("Failed to mark transfer outcome notified");
    } catch (error) {
      console.error("Transfer outcome notification failed", {
        transferId: transfer.id,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      await deps.transfers.markAttempt(transfer.id, new Date());
    }
  }
}
