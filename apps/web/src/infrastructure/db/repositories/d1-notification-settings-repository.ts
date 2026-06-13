import { eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { NotificationSettings } from "../../../domain/entities/notification-settings";
import type {
  NotificationSettingsRepository,
  NotificationSettingsRepositoryError,
  UpdateNotificationSettingsInput,
} from "../../../domain/repositories/notification-settings-repository";
import { NOTIFICATION_SETTINGS_REPOSITORY_ERROR } from "../../../domain/repositories/notification-settings-repository";
import { createDb, type DbClient } from "../client";
import { notificationSettingsTable } from "../schema/notification-settings";

type NotificationSettingsRow = typeof notificationSettingsTable.$inferSelect;

function toNotificationSettings(
  row: NotificationSettingsRow,
): NotificationSettings {
  return {
    __typename: "NotificationSettings",
    userId: row.userId,
    emailEnabled: row.emailEnabled,
    targetScope: row.targetScope as NotificationSettings["targetScope"],
    notifyOnStatusChanged: row.notifyOnStatusChanged,
    notifyOnComment: row.notifyOnComment,
    notifyOnEstimate: row.notifyOnEstimate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1NotificationSettingsRepository
  implements NotificationSettingsRepository
{
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async findByUserId(
    userId: string,
  ): Promise<
    Result<NotificationSettings | null, NotificationSettingsRepositoryError>
  > {
    try {
      const row = await this.db
        .select()
        .from(notificationSettingsTable)
        .where(eq(notificationSettingsTable.userId, userId))
        .get();

      return ok(row ? toNotificationSettings(row) : null);
    } catch {
      return err(NOTIFICATION_SETTINGS_REPOSITORY_ERROR);
    }
  }

  async createDefault(
    userId: string,
  ): Promise<
    Result<NotificationSettings, NotificationSettingsRepositoryError>
  > {
    try {
      await this.db
        .insert(notificationSettingsTable)
        .values({ userId })
        .onConflictDoNothing();

      const row = await this.db
        .select()
        .from(notificationSettingsTable)
        .where(eq(notificationSettingsTable.userId, userId))
        .get();

      if (!row) {
        return err(NOTIFICATION_SETTINGS_REPOSITORY_ERROR);
      }

      return ok(toNotificationSettings(row));
    } catch {
      return err(NOTIFICATION_SETTINGS_REPOSITORY_ERROR);
    }
  }

  async update(
    input: UpdateNotificationSettingsInput,
  ): Promise<
    Result<NotificationSettings | null, NotificationSettingsRepositoryError>
  > {
    try {
      const [updated] = await this.db
        .update(notificationSettingsTable)
        .set({
          ...(input.emailEnabled !== undefined
            ? { emailEnabled: input.emailEnabled }
            : {}),
          ...(input.targetScope !== undefined
            ? { targetScope: input.targetScope }
            : {}),
          ...(input.notifyOnStatusChanged !== undefined
            ? { notifyOnStatusChanged: input.notifyOnStatusChanged }
            : {}),
          ...(input.notifyOnComment !== undefined
            ? { notifyOnComment: input.notifyOnComment }
            : {}),
          ...(input.notifyOnEstimate !== undefined
            ? { notifyOnEstimate: input.notifyOnEstimate }
            : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(notificationSettingsTable.userId, input.userId))
        .returning();

      return ok(updated ? toNotificationSettings(updated) : null);
    } catch {
      return err(NOTIFICATION_SETTINGS_REPOSITORY_ERROR);
    }
  }
}
