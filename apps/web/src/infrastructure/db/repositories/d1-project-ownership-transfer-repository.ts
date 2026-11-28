import { and, asc, desc, eq, gt, lte, or, sql } from "drizzle-orm";
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
import type { ProjectMemberRole } from "../../../domain/entities/project-member";
import { createDb, type DbClient } from "../client";
import { projectOwnershipTransfersTable as table } from "../schema";

type Row = typeof table.$inferSelect;

export const toTransfer = (row: Row): OwnershipTransfer => ({
  id: row.id,
  projectId: row.projectId,
  fromUserId: row.fromUserId,
  toUserId: row.toUserId,
  status: row.status as OwnershipTransferStatus,
  expiresAt: row.expiresAt,
  endedAt: row.endedAt,
});

const endedValues = (
  status: "cancelled" | "declined" | "expired",
  nowIso: string,
) => ({
  status,
  outcomeNotified: 0,
  endedAt: nowIso,
  updatedAt: nowIso,
});

/**
 * 申請者が owner でない、または受け手がメンバーでない有効な申請を cancelled にする。メンバーシップを
 * 変える書き込みと同じバッチに入れ、資格を失った申請が後で資格が戻ったときに有効へ戻らないようにする。
 */
export const voidIneligibleTransfers = (
  db: DbClient,
  input: {
    /**
     * role-changed: 同じバッチのロール変更が適用された(対象が指定のロールになった)ときだけ対象にする。
     * user-removed: 退会した利用者が当事者の申請。
     */
    after:
      | {
          kind: "role-changed";
          projectId: string;
          userId: string;
          role: ProjectMemberRole;
        }
      | { kind: "user-removed"; userId: string };
    now: Date;
  },
) => {
  const nowIso = input.now.toISOString();
  const after = input.after;
  const scope =
    after.kind === "role-changed"
      ? and(
          eq(table.projectId, after.projectId),
          sql`EXISTS (SELECT 1 FROM project_members m
                      WHERE m.project_id = ${after.projectId}
                        AND m.user_id = ${after.userId} AND m.role = ${after.role})`,
        )
      : or(
          eq(table.fromUserId, after.userId),
          eq(table.toUserId, after.userId),
        );
  return db
    .update(table)
    .set(endedValues("cancelled", nowIso))
    .where(
      and(
        scope,
        eq(table.status, "pending"),
        gt(table.expiresAt, nowIso),
        sql`(NOT EXISTS (SELECT 1 FROM project_members m
                         WHERE m.project_id = project_ownership_transfers.project_id
                           AND m.user_id = project_ownership_transfers.from_user_id
                           AND m.role = 'owner')
             OR NOT EXISTS (SELECT 1 FROM project_members m
                            WHERE m.project_id = project_ownership_transfers.project_id
                              AND m.user_id = project_ownership_transfers.to_user_id))`,
      ),
    )
    .returning();
};

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

  async hasUnnotifiedSwitch(
    projectId: string,
  ): Promise<Result<boolean, OwnershipTransferRepositoryError>> {
    try {
      const row = await this.d1
        .prepare(
          "SELECT id FROM project_ownership_transfers WHERE project_id = ? AND status = 'completed' AND outcome_notified = 0 LIMIT 1",
        )
        .bind(projectId)
        .first();
      return ok(row !== null);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async listUnnotifiedOutcomes(
    limit: number,
  ): Promise<Result<OwnershipTransfer[], OwnershipTransferRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(table)
        .where(eq(table.outcomeNotified, 0))
        .orderBy(asc(table.updatedAt), asc(table.id))
        .limit(limit)
        .all();
      return ok(rows.map(toTransfer));
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
  }

  async markOutcomeNotified(
    id: string,
  ): Promise<Result<void, OwnershipTransferRepositoryError>> {
    try {
      await this.db
        .update(table)
        .set({ outcomeNotified: 1 })
        .where(eq(table.id, id));
      return ok(undefined);
    } catch {
      return err(OWNERSHIP_TRANSFER_REPOSITORY_ERROR);
    }
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
             SET status = 'completed', outcome_notified = 0,
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
                                 AND earlier.status = 'completed' AND earlier.outcome_notified = 0)`,
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
}
