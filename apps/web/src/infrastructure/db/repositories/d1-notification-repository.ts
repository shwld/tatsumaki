import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { Notification } from "../../../domain/entities/notification";
import type {
  CreateNotificationInput,
  ListNotificationsInput,
  NotificationRepository,
  NotificationRepositoryError,
} from "../../../domain/repositories/notification-repository";
import { NOTIFICATION_REPOSITORY_ERROR } from "../../../domain/repositories/notification-repository";
import { createDb, type DbClient } from "../client";
import { notificationsTable } from "../schema/notifications";

type NotificationRow = typeof notificationsTable.$inferSelect;

function toNotification(row: NotificationRow): Notification {
  return {
    __typename: "Notification",
    id: row.id,
    projectId: row.projectId,
    kind: row.kind as Notification["kind"],
    storyId: row.storyId,
    storyTitle: row.storyTitleSnapshot,
    invitationId: row.invitationId,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    createdAt: row.createdAt,
    message: row.message,
    readAt: row.readAt,
  };
}

export class D1NotificationRepository implements NotificationRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async createMany(
    input: CreateNotificationInput[],
  ): Promise<Result<void, NotificationRepositoryError>> {
    if (input.length === 0) {
      return ok(undefined);
    }

    try {
      await this.db
        .insert(notificationsTable)
        .values(input)
        .onConflictDoNothing({ target: notificationsTable.dedupeKey });
      return ok(undefined);
    } catch {
      return err(NOTIFICATION_REPOSITORY_ERROR);
    }
  }

  async listByRecipient(
    input: ListNotificationsInput,
  ): Promise<Result<Notification[], NotificationRepositoryError>> {
    try {
      const conditions = [
        eq(notificationsTable.recipientUserId, input.recipientUserId),
      ];

      if (input.projectId) {
        conditions.push(eq(notificationsTable.projectId, input.projectId));
      }

      if (input.unreadOnly) {
        conditions.push(isNull(notificationsTable.readAt));
      }

      if (input.kinds && input.kinds.length > 0) {
        conditions.push(
          inArray(
            notificationsTable.kind,
            input.kinds as [string, ...string[]],
          ),
        );
      }

      if (input.cursor) {
        conditions.push(
          or(
            lt(notificationsTable.createdAt, input.cursor.createdAt),
            and(
              eq(notificationsTable.createdAt, input.cursor.createdAt),
              lt(notificationsTable.id, input.cursor.id),
            ),
          )!,
        );
      }

      const rows = await this.db
        .select()
        .from(notificationsTable)
        .where(and(...conditions))
        .orderBy(
          desc(notificationsTable.createdAt),
          desc(notificationsTable.id),
        )
        .limit(input.limit)
        .all();

      return ok(rows.map(toNotification));
    } catch {
      return err(NOTIFICATION_REPOSITORY_ERROR);
    }
  }

  async markAsRead(input: {
    recipientUserId: string;
    notificationIds: string[];
    readAt: string;
  }): Promise<Result<number, NotificationRepositoryError>> {
    if (input.notificationIds.length === 0) {
      return ok(0);
    }

    try {
      const result = await this.db
        .update(notificationsTable)
        .set({
          readAt: input.readAt,
          updatedAt: input.readAt,
        })
        .where(
          and(
            eq(notificationsTable.recipientUserId, input.recipientUserId),
            inArray(notificationsTable.id, input.notificationIds),
            isNull(notificationsTable.readAt),
          ),
        )
        .returning({ id: notificationsTable.id });

      return ok(result.length);
    } catch {
      return err(NOTIFICATION_REPOSITORY_ERROR);
    }
  }
}
