import { err, ok, type Result } from "neverthrow";
import type { NotificationSettings } from "../../domain/entities/notification-settings";
import type {
  NotificationSettingsRepository,
  NotificationSettingsRepositoryError,
} from "../../domain/repositories/notification-settings-repository";

export async function getOrCreateNotificationSettings(
  repository: NotificationSettingsRepository,
  input: { userId: string },
): Promise<Result<NotificationSettings, NotificationSettingsRepositoryError>> {
  const foundResult = await repository.findByUserId(input.userId);
  if (foundResult.isErr()) {
    return err(foundResult.error);
  }

  if (foundResult.value) {
    return ok(foundResult.value);
  }

  return repository.createDefault(input.userId);
}
