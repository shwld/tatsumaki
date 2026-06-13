import type { Result } from "neverthrow";
import type {
  NotificationRepository,
  NotificationRepositoryError,
} from "../../domain/repositories/notification-repository";

export type MarkMyNotificationsReadError = NotificationRepositoryError;

export async function markMyNotificationsRead(
  notificationRepository: NotificationRepository,
  input: {
    viewerUserId: string;
    notificationIds: string[];
  },
): Promise<Result<number, MarkMyNotificationsReadError>> {
  return notificationRepository.markAsRead({
    recipientUserId: input.viewerUserId,
    notificationIds: [...new Set(input.notificationIds)],
    readAt: new Date().toISOString(),
  });
}
