import { ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type {
  CreateNotificationInput,
  NotificationRepository,
  NotificationRepositoryError,
} from "../../domain/repositories/notification-repository";

export type CreateAssigneeStoryActivityNotificationsError =
  NotificationRepositoryError;

export async function createAssigneeStoryActivityNotifications(
  notificationRepository: NotificationRepository,
  input: {
    projectId: string;
    /** When null (e.g. story deleted), title snapshot still shows context. */
    storyId: string | null;
    storyTitle: string;
    ownerIds: string[];
    actorUserId: string;
    actorName: string;
    activityIds: string[];
    createdAt: string;
  },
): Promise<Result<void, CreateAssigneeStoryActivityNotificationsError>> {
  if (input.activityIds.length === 0 || input.ownerIds.length === 0) {
    return ok(undefined);
  }

  const recipients = input.ownerIds.filter(
    (userId) => userId !== input.actorUserId,
  );
  if (recipients.length === 0) {
    return ok(undefined);
  }

  const rows: CreateNotificationInput[] = [];
  for (const activityId of input.activityIds) {
    for (const recipientUserId of recipients) {
      rows.push({
        id: ulid(),
        projectId: input.projectId,
        recipientUserId,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        storyId: input.storyId,
        storyTitleSnapshot: input.storyTitle,
        invitationId: null,
        kind: "story_activity",
        message: "担当ストーリーにアクティビティが追加されました",
        sourceType: "story_activity",
        sourceId: activityId,
        dedupeKey: `story_activity:${activityId}:${recipientUserId}`,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });
    }
  }

  return notificationRepository.createMany(rows);
}
