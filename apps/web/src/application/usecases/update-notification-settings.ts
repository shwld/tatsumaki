import { err, ok, type Result } from "neverthrow";
import type { NotificationSettings } from "../../domain/entities/notification-settings";
import type {
  NotificationSettingsRepository,
  NotificationSettingsRepositoryError,
} from "../../domain/repositories/notification-settings-repository";
import {
  INVALID_NOTIFICATION_TARGET_SCOPE_ERROR,
  normalizeNotificationTargetScope,
} from "./notification-settings-input";

export const NOTIFICATION_SETTINGS_NOT_FOUND_ERROR =
  "NOTIFICATION_SETTINGS_NOT_FOUND_ERROR" as const;

export type UpdateNotificationSettingsError =
  | typeof INVALID_NOTIFICATION_TARGET_SCOPE_ERROR
  | typeof NOTIFICATION_SETTINGS_NOT_FOUND_ERROR
  | NotificationSettingsRepositoryError;

export async function updateNotificationSettings(
  repository: NotificationSettingsRepository,
  input: {
    userId: string;
    emailEnabled?: boolean;
    targetScope?: string;
    notifyOnStatusChanged?: boolean;
    notifyOnComment?: boolean;
    notifyOnEstimate?: boolean;
  },
): Promise<Result<NotificationSettings, UpdateNotificationSettingsError>> {
  let targetScope = undefined as
    | NotificationSettings["targetScope"]
    | undefined;
  if (input.targetScope !== undefined) {
    const normalized = normalizeNotificationTargetScope(input.targetScope);
    if (normalized.isErr()) {
      return err(normalized.error);
    }
    targetScope = normalized.value;
  }

  const updatedResult = await repository.update({
    userId: input.userId,
    emailEnabled: input.emailEnabled,
    targetScope,
    notifyOnStatusChanged: input.notifyOnStatusChanged,
    notifyOnComment: input.notifyOnComment,
    notifyOnEstimate: input.notifyOnEstimate,
  });
  if (updatedResult.isErr()) {
    return err(updatedResult.error);
  }
  if (!updatedResult.value) {
    return err(NOTIFICATION_SETTINGS_NOT_FOUND_ERROR);
  }

  return ok(updatedResult.value);
}
