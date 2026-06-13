import type { Result } from "neverthrow";
import type { Notification, NotificationKind } from "../entities/notification";

export type NotificationSourceType =
  | "comment"
  | "story_description"
  | "invitation"
  | "story_activity";

export type CreateNotificationInput = {
  id: string;
  projectId: string;
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  storyId: string | null;
  storyTitleSnapshot: string | null;
  invitationId: string | null;
  kind: NotificationKind;
  message: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationListCursor = {
  createdAt: string;
  id: string;
};

export type ListNotificationsInput = {
  recipientUserId: string;
  projectId?: string;
  limit: number;
  cursor?: NotificationListCursor;
  unreadOnly?: boolean;
  kinds?: NotificationKind[];
};

export const NOTIFICATION_REPOSITORY_ERROR =
  "NOTIFICATION_REPOSITORY_ERROR" as const;

export type NotificationRepositoryError = typeof NOTIFICATION_REPOSITORY_ERROR;

export interface NotificationRepository {
  createMany(
    input: CreateNotificationInput[],
  ): Promise<Result<void, NotificationRepositoryError>>;

  listByRecipient(
    input: ListNotificationsInput,
  ): Promise<Result<Notification[], NotificationRepositoryError>>;

  markAsRead(input: {
    recipientUserId: string;
    notificationIds: string[];
    readAt: string;
  }): Promise<Result<number, NotificationRepositoryError>>;
}
