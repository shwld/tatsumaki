import { and, asc, desc, eq, gt, inArray, lte, or } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import {
  OWNERSHIP_TRANSFER_CONFLICT_ERROR,
  OWNERSHIP_TRANSFER_EXPIRY_DAYS,
  OWNERSHIP_TRANSFER_REPOSITORY_ERROR,
  type OwnershipTransfer,
  type OwnershipTransferRepositoryError,
  type OwnershipTransferSettlementOutcome,
  type OwnershipTransferSettlementStatus,
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
  settlementOutcome:
    row.settlementOutcome as OwnershipTransferSettlementOutcome | null,
  settlementStatus:
    row.settlementStatus as OwnershipTransferSettlementStatus | null,
  endedAt: row.endedAt,
});

const endedValues = (
  status: "cancelled" | "declined" | "expired",
  nowIso: string,
) => ({
  status,
  settlementOutcome: "not-switched" as const,
  settlementStatus: "pending" as const,
  endedAt: nowIso,
  updatedAt: nowIso,
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

  constructor(private readonly d1: D1Database) {
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
        .set(endedValues("expired", nowIso))
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
        .set(endedValues(input.status, nowIso))
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

  async findById(
    id: string,
  ): Promise<
    Result<OwnershipTransfer | null, OwnershipTransferRepositoryError>
  > {
    try {
      const row = await this.db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .get();
      return ok(row ? toTransfer(row) : null);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async findLatest(
    projectId: string,
  ): Promise<
    Result<OwnershipTransfer | null, OwnershipTransferRepositoryError>
  > {
    try {
      const row = await this.db
        .select()
        .from(table)
        .where(eq(table.projectId, projectId))
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(1)
        .get();
      return ok(row ? toTransfer(row) : null);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async findUnsettledSwitch(
    projectId: string,
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
            eq(table.status, "completed"),
            inArray(table.settlementStatus, ["pending", "review"]),
          ),
        )
        .limit(1)
        .get();
      return ok(row ? toTransfer(row) : null);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async findNoticeFor(
    projectId: string,
    userId: string,
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
            or(
              and(
                eq(table.status, "completed"),
                or(eq(table.fromUserId, userId), eq(table.toUserId, userId)),
              ),
              and(
                eq(table.settlementOutcome, "not-switched"),
                eq(table.settlementStatus, "review"),
                eq(table.toUserId, userId),
              ),
            ),
          ),
        )
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(1)
        .get();
      return ok(row ? toTransfer(row) : null);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async expireOverdue(
    now: Date,
  ): Promise<Result<void, OwnershipTransferRepositoryError>> {
    try {
      const nowIso = now.toISOString();
      await this.db
        .update(table)
        .set(endedValues("expired", nowIso))
        .where(and(eq(table.status, "pending"), lte(table.expiresAt, nowIso)));
      return ok(undefined);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async listPending(
    now: Date,
    limit: number,
  ): Promise<Result<OwnershipTransfer[], OwnershipTransferRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(table)
        .where(
          and(
            eq(table.status, "pending"),
            gt(table.expiresAt, now.toISOString()),
          ),
        )
        .orderBy(asc(table.updatedAt), asc(table.id))
        .limit(limit)
        .all();
      return ok(rows.map(toTransfer));
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async listUnsettled(
    limit: number,
  ): Promise<Result<OwnershipTransfer[], OwnershipTransferRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(table)
        .where(eq(table.settlementStatus, "pending"))
        .orderBy(asc(table.updatedAt), asc(table.id))
        .limit(limit)
        .all();
      return ok(rows.map(toTransfer));
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async complete(input: {
    id: string;
    now: Date;
  }): Promise<Result<boolean, OwnershipTransferRepositoryError>> {
    const nowIso = input.now.toISOString();
    try {
      const [completed] = await this.d1.batch([
        this.d1
          .prepare(
            `UPDATE project_ownership_transfers
             SET status = 'completed', settlement_outcome = 'switched', settlement_status = 'pending',
                 ended_at = ?1, updated_at = ?1
             WHERE id = ?2 AND status = 'pending' AND expires_at > ?1
               AND EXISTS (SELECT 1 FROM project_members m
                           WHERE m.project_id = project_ownership_transfers.project_id
                             AND m.user_id = project_ownership_transfers.from_user_id AND m.role = 'owner')
               AND EXISTS (SELECT 1 FROM project_members m
                           WHERE m.project_id = project_ownership_transfers.project_id
                             AND m.user_id = project_ownership_transfers.to_user_id)
               AND NOT EXISTS (SELECT 1 FROM project_deletion_requests d
                               WHERE d.project_id = project_ownership_transfers.project_id)
               AND NOT EXISTS (SELECT 1 FROM project_ownership_transfers earlier
                               WHERE earlier.project_id = project_ownership_transfers.project_id
                                 AND earlier.status = 'completed' AND earlier.settlement_status IN ('pending', 'review'))`,
          )
          .bind(nowIso, input.id),
        this.d1
          .prepare(
            `UPDATE project_members SET role = 'owner', updated_at = CURRENT_TIMESTAMP
             WHERE (project_id, user_id) IN (
               SELECT project_id, to_user_id FROM project_ownership_transfers
               WHERE id = ?1 AND status = 'completed' AND ended_at = ?2)`,
          )
          .bind(input.id, nowIso),
        this.d1
          .prepare(
            `UPDATE project_members SET role = 'member', updated_at = CURRENT_TIMESTAMP
             WHERE (project_id, user_id) IN (
               SELECT project_id, from_user_id FROM project_ownership_transfers
               WHERE id = ?1 AND status = 'completed' AND ended_at = ?2)`,
          )
          .bind(input.id, nowIso),
      ]);
      return ok((completed?.meta.changes ?? 0) > 0);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async markAttempt(
    id: string,
    now: Date,
  ): Promise<Result<void, OwnershipTransferRepositoryError>> {
    try {
      await this.db
        .update(table)
        .set({ updatedAt: now.toISOString() })
        .where(eq(table.id, id));
      return ok(undefined);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async markSettlement(input: {
    id: string;
    status: OwnershipTransferSettlementStatus;
    note?: string;
    now: Date;
  }): Promise<Result<void, OwnershipTransferRepositoryError>> {
    try {
      await this.db
        .update(table)
        .set({
          settlementStatus: input.status,
          settlementNote: input.note ?? null,
          updatedAt: input.now.toISOString(),
        })
        .where(eq(table.id, input.id));
      return ok(undefined);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }
}
