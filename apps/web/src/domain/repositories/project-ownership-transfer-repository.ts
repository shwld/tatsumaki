import type { Result } from "neverthrow";

export const OWNERSHIP_TRANSFER_REPOSITORY_ERROR =
  "OWNERSHIP_TRANSFER_REPOSITORY_ERROR" as const;
export const OWNERSHIP_TRANSFER_CONFLICT_ERROR =
  "OWNERSHIP_TRANSFER_CONFLICT_ERROR" as const;

export type OwnershipTransferRepositoryError =
  | typeof OWNERSHIP_TRANSFER_REPOSITORY_ERROR
  | typeof OWNERSHIP_TRANSFER_CONFLICT_ERROR;

export const OWNERSHIP_TRANSFER_EXPIRY_DAYS = 7;

export type OwnershipTransferStatus =
  | "pending"
  | "completed"
  | "cancelled"
  | "declined"
  | "expired";

export type OwnershipTransfer = {
  id: string;
  projectId: string;
  fromUserId: string;
  toUserId: string;
  status: OwnershipTransferStatus;
  expiresAt: string;
  /** 申請が終了または完了した時刻。 */
  endedAt: string | null;
};

export interface ProjectOwnershipTransferRepository {
  hasUnnotifiedSwitch(
    projectId: string,
  ): Promise<Result<boolean, OwnershipTransferRepositoryError>>;
  listUnnotifiedOutcomes(
    limit: number,
  ): Promise<Result<OwnershipTransfer[], OwnershipTransferRepositoryError>>;
  markOutcomeNotified(
    id: string,
  ): Promise<Result<void, OwnershipTransferRepositoryError>>;
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
  /** 期限切れの有効な申請を expired にして通知待ちにする。 */
  expireOverdue(
    now: Date,
  ): Promise<Result<void, OwnershipTransferRepositoryError>>;
  /** 期限内の有効な申請を、確認が古い順に最大 limit 件返す。 */
  listPending(
    now: Date,
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
  /** 有効な申請だけを終了させる。すでに終わっていれば false。 */
  close(input: {
    id: string;
    status: "cancelled" | "declined";
    now: Date;
  }): Promise<Result<boolean, OwnershipTransferRepositoryError>>;
}
