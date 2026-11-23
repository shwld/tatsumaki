import { and, eq, inArray, or, sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { User } from "../../../domain/entities/user";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRepository,
  UserRepositoryError,
} from "../../../domain/repositories/user-repository";
import { USER_REPOSITORY_ERROR } from "../../../domain/repositories/user-repository";
import type { OwnershipTransfer } from "../../../domain/repositories/project-ownership-transfer-repository";
import { createDb, type DbClient } from "../client";
import {
  toTransfer,
  voidIneligibleTransfers,
} from "./d1-project-ownership-transfer-repository";
import {
  usersTable,
  notificationsTable,
  projectMembersTable,
  projectApiKeysTable,
  projectInvitationsTable,
} from "../schema";
import { storiesTable, storyOwnersTable } from "../schema/stories";
import { storyTimelineEntriesTable } from "../schema/story-timeline";

type UserRow = typeof usersTable.$inferSelect;

function toUser(row: UserRow): User {
  return {
    __typename: "User",
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    avatarUrl: row.avatarUrl ?? null,
    termsAcceptedAt: row.termsAcceptedAt ?? null,
    termsVersion: row.termsVersion ?? null,
    accessStatus: row.accessStatus === "allowed" ? "allowed" : "blocked",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1UserRepository implements UserRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async findById(
    id: string,
  ): Promise<Result<User | null, UserRepositoryError>> {
    const row = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .get();

    return ok(row ? toUser(row) : null);
  }

  async findByEmail(
    email: string,
  ): Promise<Result<User | null, UserRepositoryError>> {
    const row = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .get();
    return ok(row ? toUser(row) : null);
  }

  async findByIds(ids: string[]): Promise<Result<User[], UserRepositoryError>> {
    if (ids.length === 0) {
      return ok([]);
    }
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(inArray(usersTable.id, ids))
      .all();
    return ok(rows.map(toUser));
  }

  async create(
    input: CreateUserInput,
  ): Promise<Result<User, UserRepositoryError>> {
    const [created] = await this.db
      .insert(usersTable)
      .values({
        id: input.id,
        displayName: input.displayName,
        email: input.email,
        termsAcceptedAt: input.termsAcceptedAt ?? null,
        termsVersion: input.termsVersion ?? null,
      })
      .returning();

    if (!created) {
      return err(USER_REPOSITORY_ERROR);
    }

    return ok(toUser(created));
  }

  async update(
    input: UpdateUserInput,
  ): Promise<Result<User | null, UserRepositoryError>> {
    const [updated] = await this.db
      .update(usersTable)
      .set({
        displayName: input.displayName,
        email: input.email,
        ...(input.avatarUrl !== undefined
          ? { avatarUrl: input.avatarUrl }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(usersTable.id, input.id))
      .returning();

    return ok(updated ? toUser(updated) : null);
  }

  async delete(
    id: string,
    now: Date,
  ): Promise<
    Result<{ voidedTransfers: OwnershipTransfer[] }, UserRepositoryError>
  > {
    try {
      // Execute all cleanup and the user delete atomically via D1 batch.
      // Order: children first, then project_members, then users (FK cascade handles
      // notification_settings and saved_filters automatically).
      const [, , , , , , , , voidedRows] = await this.db.batch([
        this.db
          .update(storiesTable)
          .set({ requesterId: null })
          .where(eq(storiesTable.requesterId, id)),
        this.db.delete(storyOwnersTable).where(eq(storyOwnersTable.userId, id)),
        this.db
          .update(storyTimelineEntriesTable)
          .set({ actorUserId: null })
          .where(eq(storyTimelineEntriesTable.actorUserId, id)),
        this.db
          .delete(notificationsTable)
          .where(eq(notificationsTable.recipientUserId, id)),
        this.db
          .update(notificationsTable)
          .set({ actorUserId: null })
          .where(eq(notificationsTable.actorUserId, id)),
        this.db
          .delete(projectApiKeysTable)
          .where(eq(projectApiKeysTable.ownerUserId, id)),
        this.db
          .delete(projectInvitationsTable)
          .where(
            or(
              eq(projectInvitationsTable.inviterUserId, id),
              eq(projectInvitationsTable.targetUserId, id),
              eq(projectInvitationsTable.acceptedByUserId, id),
            ),
          ),
        this.db.delete(projectMembersTable).where(
          and(
            eq(projectMembersTable.userId, id),
            sql`(${projectMembersTable.role} <> 'owner' OR EXISTS (
              SELECT 1 FROM project_members other
              WHERE other.project_id = ${projectMembersTable.projectId}
                AND other.role = 'owner'
                AND other.user_id <> ${id}
            ))`,
          ),
        ),
        voidIneligibleTransfers(this.db, {
          after: { kind: "user-removed", userId: id },
          now,
        }),
        // usecase の事前チェックと並行操作で競合しても、owner 不在や孤児 owner を残さないため。
        this.db.insert(usersTable).select(
          this.db
            .select()
            .from(usersTable)
            .where(
              and(
                eq(usersTable.id, id),
                sql`EXISTS (
                  SELECT 1 FROM project_members
                  WHERE user_id = ${id} AND role = 'owner'
                )`,
              ),
            ),
        ),
        this.db.delete(usersTable).where(eq(usersTable.id, id)),
      ]);

      return ok({ voidedTransfers: voidedRows.map(toTransfer) });
    } catch {
      return err(USER_REPOSITORY_ERROR);
    }
  }
}
