import { ulid } from "ulid";
import { ok, type Result } from "neverthrow";
import type {
  NotificationRepository,
  NotificationRepositoryError,
  NotificationSourceType,
} from "../../domain/repositories/notification-repository";

const MENTION_PATTERN = /(^|\s)@([A-Za-z0-9._|:-]+)/g;
const MENTION_LINK_PATTERN = /\[@([^\]\n]+)\]\(mention:([^)]+)\)/g;

export function extractMentionedUserIds(text: string): Set<string> {
  const mentioned = new Set<string>();
  for (const match of text.matchAll(MENTION_LINK_PATTERN)) {
    const userId = match[2]?.trim();
    if (userId) {
      mentioned.add(userId);
    }
  }
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const userId = match[2]?.trim();
    if (userId) {
      mentioned.add(userId);
    }
  }
  return mentioned;
}

function buildDefaultMessage(params: {
  sourceType: NotificationSourceType;
  text: string;
}): string {
  if (params.sourceType === "story_description") {
    return "概要文であなたにメンションしました";
  }
  return params.text.trim().length > 0
    ? params.text
    : "コメントであなたにメンションしました";
}

export type CreateMentionNotificationsError = NotificationRepositoryError;

export async function createMentionNotifications(
  notificationRepository: NotificationRepository,
  input: {
    projectId: string;
    storyId: string;
    storyTitle: string;
    actorUserId: string;
    actorName: string;
    sourceType: NotificationSourceType;
    sourceId: string;
    text: string;
    memberUserIds: string[];
    createdAt?: string;
  },
): Promise<Result<void, CreateMentionNotificationsError>> {
  const mentionedUserIds = extractMentionedUserIds(input.text);
  if (mentionedUserIds.size === 0) {
    return ok(undefined);
  }

  const memberSet = new Set(input.memberUserIds);
  const recipientUserIds = [...mentionedUserIds].filter(
    (userId) => userId !== input.actorUserId && memberSet.has(userId),
  );

  if (recipientUserIds.length === 0) {
    return ok(undefined);
  }

  const now = input.createdAt ?? new Date().toISOString();
  const message = buildDefaultMessage({
    sourceType: input.sourceType,
    text: input.text,
  });

  return notificationRepository.createMany(
    recipientUserIds.map((recipientUserId) => ({
      id: ulid(),
      projectId: input.projectId,
      recipientUserId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      storyId: input.storyId,
      storyTitleSnapshot: input.storyTitle,
      invitationId: null,
      kind: "mention" as const,
      message,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      dedupeKey: `mention:${input.sourceType}:${input.sourceId}:${recipientUserId}`,
      createdAt: now,
      updatedAt: now,
    })),
  );
}
