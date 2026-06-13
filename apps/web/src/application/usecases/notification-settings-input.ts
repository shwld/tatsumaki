import { err, ok, type Result } from "neverthrow";
import {
  NOTIFICATION_TARGET_SCOPES,
  type NotificationTargetScope,
} from "../../domain/entities/notification-settings";

export const INVALID_NOTIFICATION_TARGET_SCOPE_ERROR =
  "INVALID_NOTIFICATION_TARGET_SCOPE_ERROR" as const;

export function normalizeNotificationTargetScope(
  value: string,
): Result<
  NotificationTargetScope,
  typeof INVALID_NOTIFICATION_TARGET_SCOPE_ERROR
> {
  if (NOTIFICATION_TARGET_SCOPES.includes(value as NotificationTargetScope)) {
    return ok(value as NotificationTargetScope);
  }
  return err(INVALID_NOTIFICATION_TARGET_SCOPE_ERROR);
}
