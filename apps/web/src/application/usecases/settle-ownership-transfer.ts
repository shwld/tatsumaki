import type { ProjectDeletionRequestRepository } from "../../domain/repositories/project-deletion-request-repository";
import {
  OWNERSHIP_TRANSFER_SETTLEMENT_WINDOW_MS,
  type OwnershipTransfer,
  type OwnershipTransferSettlementStatus,
  type ProjectOwnershipTransferRepository,
} from "../../domain/repositories/project-ownership-transfer-repository";
import type { OwnershipTransferSettlementGateway } from "../ports/ownership-transfer-settlement-gateway";

export type SettleDeps = {
  transfers: ProjectOwnershipTransferRepository;
  settlement: OwnershipTransferSettlementGateway;
  deletions: Pick<ProjectDeletionRequestRepository, "findById">;
};

export type PendingTransferOutcome =
  | "waiting"
  | "switched"
  | "not-switched"
  | "unavailable";

/**
 * 解約・返金の結果を記録する。受け手の決済は申請の終了後にも届きうるため、成立しなかった譲渡は
 * 確認期間が過ぎるまで精算待ちのままにして、繰り返し確認する。失敗は精算待ちのまま次回に再試行する。
 */
export async function settleTransfer(
  deps: Pick<SettleDeps, "transfers" | "settlement">,
  transfer: OwnershipTransfer,
  now: Date,
): Promise<OwnershipTransferSettlementStatus> {
  const outcome = transfer.settlementOutcome;
  if (transfer.settlementStatus !== "pending" || outcome === null) {
    return transfer.settlementStatus ?? "pending";
  }
  const endedAt = transfer.endedAt ?? now.toISOString();
  let result: Awaited<ReturnType<OwnershipTransferSettlementGateway["settle"]>>;
  try {
    result = await deps.settlement.settle({
      projectId: transfer.projectId,
      transferId: transfer.id,
      outcome,
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      switchedAt: endedAt,
    });
  } catch (error) {
    console.error("Ownership transfer settlement failed", {
      transferId: transfer.id,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return "pending";
  }

  if (result.status === "review") {
    console.error("Ownership transfer needs review", {
      transferId: transfer.id,
      projectId: transfer.projectId,
      reason: result.reviewReason,
    });
    await deps.transfers.markSettlement({
      id: transfer.id,
      status: "review",
      ...(result.reviewReason ? { note: result.reviewReason } : {}),
      now,
    });
    return "review";
  }
  const windowClosed =
    now.getTime() - new Date(endedAt).getTime() >=
    OWNERSHIP_TRANSFER_SETTLEMENT_WINDOW_MS;
  if (outcome === "not-switched" && !windowClosed) return "pending";
  await deps.transfers.markSettlement({
    id: transfer.id,
    status: "settled",
    now,
  });
  return "settled";
}

/**
 * 有効な申請の受け手の購読が支払い済みなら、所有者を切り替える。旧購読が失われている、または
 * プロジェクトが削除手続き中なら、譲渡を成立させず受け手の購読を返金に回す。
 * 切替後の解約・返金は settleTransfer が行う。
 */
export async function reconcilePendingTransfer(
  deps: SettleDeps,
  transfer: OwnershipTransfer,
  now: Date,
): Promise<PendingTransferOutcome> {
  try {
    const payment = await deps.settlement.confirmPayment({
      projectId: transfer.projectId,
      transferId: transfer.id,
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
    });
    if (!payment.recipientSubscribed) return "waiting";

    const deletion = await deps.deletions.findById(transfer.projectId);
    if (deletion.isErr()) return "unavailable";

    if (payment.previousSubscriptionLive && !deletion.value) {
      const completed = await deps.transfers.complete({ id: transfer.id, now });
      if (completed.isErr()) return "unavailable";
      if (completed.value) return "switched";
      const latest = await deps.transfers.findById(transfer.id);
      if (latest.isErr() || !latest.value) return "unavailable";
      if (latest.value.status === "completed") return "switched";
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

/** 申請の状態を確かめ、切替と精算を進める。精算が未完了なら次の確認に持ち越す。 */
export async function advanceOwnershipTransfer(
  deps: SettleDeps,
  transfer: OwnershipTransfer,
  now: Date,
): Promise<void> {
  let current = transfer;
  if (current.status === "pending") {
    const outcome = await reconcilePendingTransfer(deps, current, now);
    if (outcome === "waiting" || outcome === "unavailable") return;
    const latest = await deps.transfers.findById(current.id);
    if (latest.isErr() || !latest.value) return;
    current = latest.value;
  }
  await settleTransfer(deps, current, now);
}

export type RecoverySummary = { pending: number; unsettled: number };

const RECOVERY_BATCH = 50;

/** 定期ジョブ。誰も画面を開かなくても、切替と精算が完了または運営の調査待ちに収束する。 */
export async function recoverOwnershipTransfers(
  deps: SettleDeps,
  now: Date,
): Promise<RecoverySummary> {
  await deps.transfers.expireOverdue(now);

  const pending = await deps.transfers.listPending(now, RECOVERY_BATCH);
  const pendingTransfers = pending.isOk() ? pending.value : [];
  for (const transfer of pendingTransfers) {
    await advanceOwnershipTransfer(deps, transfer, now);
  }

  const unsettled = await deps.transfers.listUnsettled(RECOVERY_BATCH);
  const unsettledTransfers = unsettled.isOk() ? unsettled.value : [];
  for (const transfer of unsettledTransfers) {
    await settleTransfer(deps, transfer, now);
  }
  return {
    pending: pendingTransfers.length,
    unsettled: unsettledTransfers.length,
  };
}
