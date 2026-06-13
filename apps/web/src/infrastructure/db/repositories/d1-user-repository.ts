import { eq, inArray, or } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { User } from "../../../domain/entities/user";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRepository,
  UserRepositoryError,
} from "../../../domain/repositories/user-repository";
import { USER_REPOSITORY_ERROR } from "../../../domain/repositories/user-repository";
import { createDb, type DbClient } from "../client";
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

  async delete(id: string): Promise<Result<true, UserRepositoryError>> {
    try {
      // Execute all cleanup and the user delete atomically via D1 batch.
      // Order: children first, then project_members, then users (FK cascade handles
      // notification_settings and saved_filters automatically).
      await this.db.batch([
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
        this.db
          .delete(projectMembersTable)
          .where(eq(projectMembersTable.userId, id)),
        this.db.delete(usersTable).where(eq(usersTable.id, id)),
      ]);

      return ok(true);
    } catch {
      return err(USER_REPOSITORY_ERROR);
    }
  }
}
