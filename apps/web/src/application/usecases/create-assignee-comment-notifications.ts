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

export type BuildAssigneeCommentNotificationsInput = {
  projectId: string;
  storyId: string;
  storyTitle: string;
  ownerIds: string[];
  actorUserId: string;
  actorName: string;
  commentId: string;
  commentBody: string;
  createdAt: string;
};

export function buildAssigneeCommentNotifications(
  input: BuildAssigneeCommentNotificationsInput,
): CreateNotificationInput[] {
  const mentioned = extractMentionedUserIds(input.commentBody);
  const recipients = input.ownerIds.filter(
    (userId) => userId !== input.actorUserId && !mentioned.has(userId),
  );

  return recipients.map((recipientUserId) => ({
    id: ulid(),
    projectId: input.projectId,
    recipientUserId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    storyId: input.storyId,
    storyTitleSnapshot: input.storyTitle,
    invitationId: null,
    kind: "comment_added" as const,
    message: "担当ストーリーにコメントが追加されました",
    sourceType: "comment" as const,
    sourceId: input.commentId,
    dedupeKey: `assignee_comment:${input.commentId}:${recipientUserId}`,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }));
}

export async function createAssigneeCommentNotifications(
  notificationRepository: NotificationRepository,
  input: BuildAssigneeCommentNotificationsInput,
): Promise<Result<void, CreateAssigneeCommentNotificationsError>> {
  const rows = buildAssigneeCommentNotifications(input);
  if (rows.length === 0) {
    return ok(undefined);
  }
  return notificationRepository.createMany(rows);
}
