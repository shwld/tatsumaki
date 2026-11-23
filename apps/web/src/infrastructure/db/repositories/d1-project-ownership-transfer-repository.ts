import { and, eq, lte, gt } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import {
  OWNERSHIP_TRANSFER_CONFLICT_ERROR,
  OWNERSHIP_TRANSFER_EXPIRY_DAYS,
  OWNERSHIP_TRANSFER_REPOSITORY_ERROR,
  type OwnershipTransfer,
  type OwnershipTransferRepositoryError,
  type OwnershipTransferStatus,
  type ProjectOwnershipTransferRepository,
} from "../../../domain/repositories/project-ownership-transfer-repository";
import { createDb, type DbClient } from "../client";
import { projectOwnershipTransfersTable as table } from "../schema";

type Row = typeof table.$inferSelect;

const toTransfer = (row: Row): OwnershipTransfer => ({
  id: row.id,
  projectId: row.projectId,
  fromUserId: row.fromUserId,
  toUserId: row.toUserId,
  status: row.status as OwnershipTransferStatus,
  expiresAt: row.expiresAt,
});

const isUniqueViolation = (error: unknown): boolean => {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause.message.includes("UNIQUE")) return true;
  }
  return false;
};

export class D1ProjectOwnershipTransferRepository
  implements ProjectOwnershipTransferRepository
{
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async create(input: {
    projectId: string;
    fromUserId: string;
    toUserId: string;
    now: Date;
  }): Promise<Result<OwnershipTransfer, OwnershipTransferRepositoryError>> {
    const nowIso = input.now.toISOString();
    const expiresAt = new Date(
      input.now.getTime() + OWNERSHIP_TRANSFER_EXPIRY_DAYS * 86_400_000,
    ).toISOString();
    try {
      await this.db
        .update(table)
        .set({ status: "expired", updatedAt: nowIso })
        .where(
          and(
            eq(table.projectId, input.projectId),
            eq(table.status, "pending"),
            lte(table.expiresAt, nowIso),
          ),
        );
      const row = await this.db
        .insert(table)
        .values({
          id: ulid(),
          projectId: input.projectId,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          expiresAt,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .returning()
        .get();
      return ok(toTransfer(row));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return err(OWNERSHIP_TRANSFER_CONFLICT_ERROR);
      }
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async findPending(
    projectId: string,
    now: Date,
  ): Promise<
    Result<OwnershipTransfer | null, OwnershipTransferRepositoryError>
  > {
    try {
      const row = await this.db
        .select()
        .from(table)
        .where(
          and(
            eq(table.projectId, projectId),
            eq(table.status, "pending"),
            gt(table.expiresAt, now.toISOString()),
          ),
        )
        .get();
      return ok(row ? toTransfer(row) : null);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async close(input: {
    id: string;
    status: "cancelled" | "declined";
    now: Date;
  }): Promise<Result<boolean, OwnershipTransferRepositoryError>> {
    try {
      const nowIso = input.now.toISOString();
      const rows = await this.db
        .update(table)
        .set({ status: input.status, updatedAt: nowIso })
        .where(
          and(
            eq(table.id, input.id),
            eq(table.status, "pending"),
            gt(table.expiresAt, nowIso),
          ),
        )
        .returning({ id: table.id })
        .all();
      return ok(rows.length > 0);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }
}
