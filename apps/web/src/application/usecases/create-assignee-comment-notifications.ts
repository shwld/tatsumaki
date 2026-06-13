import { ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import { extractMentionedUserIds } from "./create-mention-notifications";
import type {
  CreateNotificationInput,
  NotificationRepository,
  NotificationRepositoryError,
} from "../../domain/repositories/notification-repository";

export type CreateAssigneeCommentNotificationsError =
  NotificationRepositoryError;

export async function createAssigneeCommentNotifications(
  notificationRepository: NotificationRepository,
  input: {
    projectId: string;
    storyId: string;
    storyTitle: string;
    ownerIds: string[];
    actorUserId: string;
    actorName: string;
    commentId: string;
    commentBody: string;
    createdAt: string;
  },
): Promise<Result<void, CreateAssigneeCommentNotificationsError>> {
  if (input.ownerIds.length === 0) {
    return ok(undefined);
  }

  const mentioned = extractMentionedUserIds(input.commentBody);
  const recipients = input.ownerIds.filter(
    (userId) => userId !== input.actorUserId && !mentioned.has(userId),
  );
  if (recipients.length === 0) {
    return ok(undefined);
  }

  const rows: CreateNotificationInput[] = recipients.map((recipientUserId) => ({
    id: ulid(),
    projectId: input.projectId,
    recipientUserId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    storyId: input.storyId,
    storyTitleSnapshot: input.storyTitle,
    invitationId: null,
    kind: "comment_added",
    message: "担当ストーリーにコメントが追加されました",
    sourceType: "comment",
    sourceId: input.commentId,
    dedupeKey: `assignee_comment:${input.commentId}:${recipientUserId}`,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }));

  return notificationRepository.createMany(rows);
}
