import type { Result } from "neverthrow";

export const OWNERSHIP_TRANSFER_REPOSITORY_ERROR =
  "OWNERSHIP_TRANSFER_REPOSITORY_ERROR" as const;
export const OWNERSHIP_TRANSFER_CONFLICT_ERROR =
  "OWNERSHIP_TRANSFER_CONFLICT_ERROR" as const;

export type OwnershipTransferRepositoryError =
  | typeof OWNERSHIP_TRANSFER_REPOSITORY_ERROR
  | typeof OWNERSHIP_TRANSFER_CONFLICT_ERROR;

export const OWNERSHIP_TRANSFER_EXPIRY_DAYS = 7;

/**
 * 譲渡が終わった後も、受け手の決済が遅れて届く余地が残る。Checkout は作成から最大 24 時間で
 * 失効するため、その後に 1 時間の余裕を足した間は、終わった譲渡の精算を繰り返し確認する。
 */
export const OWNERSHIP_TRANSFER_SETTLEMENT_WINDOW_MS = 25 * 3_600_000;

export type OwnershipTransferStatus =
  | "pending"
  | "completed"
  | "cancelled"
  | "declined"
  | "expired";

/** switched: 受け手が owner になり旧購読を解約する。not-switched: 受け手の購読を解約し全額返金する。 */
export type OwnershipTransferSettlementOutcome = "switched" | "not-switched";

/** pending: 解約・返金を実行中または再試行待ち。review: 自動では返金できず運営が調査する。 */
export type OwnershipTransferSettlementStatus =
  | "pending"
  | "settled"
  | "review";

export type OwnershipTransfer = {
  id: string;
  projectId: string;
  fromUserId: string;
  toUserId: string;
  status: OwnershipTransferStatus;
  expiresAt: string;
  settlementOutcome: OwnershipTransferSettlementOutcome | null;
  settlementStatus: OwnershipTransferSettlementStatus | null;
  /** 終了または完了した時刻。切替時点の日割りと、精算の確認期間の起点になる。 */
  endedAt: string | null;
};

export interface ProjectOwnershipTransferRepository {
  /**
   * 期限切れの有効申請を expired にしてから作る。有効な申請が残っていれば
   * OWNERSHIP_TRANSFER_CONFLICT_ERROR を返し、同時申請でも 1 件に絞る。
   */
  create(input: {
    projectId: string;
    fromUserId: string;
    toUserId: string;
    now: Date;
  }): Promise<Result<OwnershipTransfer, OwnershipTransferRepositoryError>>;
  /** 期限内の有効な申請だけを返す。 */
  findPending(
    projectId: string,
    now: Date,
  ): Promise<
    Result<OwnershipTransfer | null, OwnershipTransferRepositoryError>
  >;
  /** 期限内の有効な申請に限らず、IDで1件返す。 */
  findById(
    id: string,
  ): Promise<
    Result<OwnershipTransfer | null, OwnershipTransferRepositoryError>
  >;
  /** プロジェクトの最新の申請。状態を問わない。 */
  findLatest(
    projectId: string,
  ): Promise<
    Result<OwnershipTransfer | null, OwnershipTransferRepositoryError>
  >;
  /** 完了済みで精算が済んでいない(処理中または運営の調査待ち)申請。この間は同じプロジェクトの次の切替を待たせる。 */
  findUnsettledSwitch(
    projectId: string,
  ): Promise<
    Result<OwnershipTransfer | null, OwnershipTransferRepositoryError>
  >;
  /**
   * その利用者に見せる通知の元になる最新の申請。完了した譲渡、または自分が受け手で返金が運営の調査待ちの
   * 譲渡。新しい申請や、通知のない終了済みの申請に隠れない。
   */
  findNoticeFor(
    projectId: string,
    userId: string,
  ): Promise<
    Result<OwnershipTransfer | null, OwnershipTransferRepositoryError>
  >;
  /** 期限切れの有効な申請を expired にして精算待ちにする。 */
  expireOverdue(
    now: Date,
  ): Promise<Result<void, OwnershipTransferRepositoryError>>;
  /** 期限内の有効な申請を、確認が古い順に最大 limit 件返す。 */
  listPending(
    now: Date,
    limit: number,
  ): Promise<Result<OwnershipTransfer[], OwnershipTransferRepositoryError>>;
  /** 精算が済んでいない申請を、確認が古い順に最大 limit 件返す。 */
  listUnsettled(
    limit: number,
  ): Promise<Result<OwnershipTransfer[], OwnershipTransferRepositoryError>>;
  /**
   * 申請者が owner、受け手がメンバーのまま、期限内の有効な申請を完了にし、受け手を owner・
   * 申請者を member にする。ロール変更と状態の変更は同じトランザクションで行い、満たさなければ
   * 何も変えず false を返す。他の owner の権限は変えない。
   */
  complete(input: {
    id: string;
    now: Date;
  }): Promise<Result<boolean, OwnershipTransferRepositoryError>>;
  /** 定期ジョブが確認した印を付け、次の確認を他の申請に譲る。 */
  markAttempt(
    id: string,
    now: Date,
  ): Promise<Result<void, OwnershipTransferRepositoryError>>;
  /** 精算の結果を記録する。 */
  markSettlement(input: {
    id: string;
    status: OwnershipTransferSettlementStatus;
    note?: string;
    now: Date;
  }): Promise<Result<void, OwnershipTransferRepositoryError>>;
  /** 有効な申請だけを終了させる。すでに終わっていれば false。 */
  close(input: {
    id: string;
    status: "cancelled" | "declined";
    now: Date;
  }): Promise<Result<boolean, OwnershipTransferRepositoryError>>;
}
