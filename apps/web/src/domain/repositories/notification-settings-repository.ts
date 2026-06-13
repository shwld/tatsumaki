import type { Result } from "neverthrow";
import type {
  NotificationSettings,
  NotificationTargetScope,
} from "../entities/notification-settings";

export type UpdateNotificationSettingsInput = {
  userId: string;
  emailEnabled?: boolean;
  targetScope?: NotificationTargetScope;
  notifyOnStatusChanged?: boolean;
  notifyOnComment?: boolean;
  notifyOnEstimate?: boolean;
};

export const NOTIFICATION_SETTINGS_REPOSITORY_ERROR =
  "NOTIFICATION_SETTINGS_REPOSITORY_ERROR" as const;

export type NotificationSettingsRepositoryError =
  typeof NOTIFICATION_SETTINGS_REPOSITORY_ERROR;

export interface NotificationSettingsRepository {
  findByUserId(
    userId: string,
  ): Promise<
    Result<NotificationSettings | null, NotificationSettingsRepositoryError>
  >;
  createDefault(
    userId: string,
  ): Promise<Result<NotificationSettings, NotificationSettingsRepositoryError>>;
  update(
    input: UpdateNotificationSettingsInput,
  ): Promise<
    Result<NotificationSettings | null, NotificationSettingsRepositoryError>
  >;
}
