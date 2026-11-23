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
  /** 有効な申請だけを終了させる。すでに終わっていれば false。 */
  close(input: {
    id: string;
    status: "cancelled" | "declined";
    now: Date;
  }): Promise<Result<boolean, OwnershipTransferRepositoryError>>;
}
