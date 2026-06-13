import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type {
  NotificationRepository,
  NotificationRepositoryError,
} from "../../domain/repositories/notification-repository";
import type { UserRepository } from "../../domain/repositories/user-repository";

type Input = {
  projectId: string;
  invitationId: string;
  targetUserId: string | null;
  targetEmail: string | null;
  actorUserId: string;
  actorName: string;
  createdAt?: string;
};

export async function createInvitationNotification(
  userRepository: UserRepository,
  notificationRepository: NotificationRepository,
  input: Input,
): Promise<Result<void, NotificationRepositoryError>> {
  let recipientUserId = input.targetUserId;
  if (!recipientUserId && input.targetEmail) {
    const userResult = await userRepository.findByEmail(input.targetEmail);
    if (userResult.isErr()) {
      return err("NOTIFICATION_REPOSITORY_ERROR");
    }
    recipientUserId = userResult.value?.id ?? null;
  }
  if (!recipientUserId) {
    return ok(undefined);
  }

  const now = input.createdAt ?? new Date().toISOString();
  const result = await notificationRepository.createMany([
    {
      id: ulid(),
      projectId: input.projectId,
      recipientUserId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      storyId: null,
      storyTitleSnapshot: null,
      invitationId: input.invitationId,
      kind: "member_invitation",
      message: "プロジェクト招待が届いています",
      sourceType: "invitation",
      sourceId: input.invitationId,
      dedupeKey: `invitation:${input.invitationId}:${recipientUserId}`,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  return result.isErr() ? err(result.error) : ok(undefined);
}
