import { err, ok, type Result } from "neverthrow";
import type {
  Notification,
  NotificationKind,
} from "../../domain/entities/notification";
import type {
  NotificationListCursor,
  NotificationRepository,
  NotificationRepositoryError,
} from "../../domain/repositories/notification-repository";

export const INVALID_NOTIFICATIONS_CURSOR_ERROR =
  "INVALID_NOTIFICATIONS_CURSOR_ERROR" as const;

export type ListMyNotificationsError =
  | NotificationRepositoryError
  | typeof INVALID_NOTIFICATIONS_CURSOR_ERROR;

type ListMyNotificationsInput = {
  projectId?: string;
  viewerUserId: string;
  limit: number;
  cursor?: string;
  unreadOnly?: boolean;
  kinds?: NotificationKind[];
};

type ListMyNotificationsOutput = {
  notifications: Notification[];
  page: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 50;
  }
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function encodeCursor(cursor: NotificationListCursor): string {
  return toBase64Url(`${cursor.createdAt}|${cursor.id}`);
}

function decodeCursor(cursor: string): NotificationListCursor | null {
  const decoded = fromBase64Url(cursor);
  if (!decoded) {
    return null;
  }

  const delimiterIndex = decoded.lastIndexOf("|");
  if (delimiterIndex <= 0 || delimiterIndex >= decoded.length - 1) {
    return null;
  }

  const createdAt = decoded.slice(0, delimiterIndex);
  const id = decoded.slice(delimiterIndex + 1);
  if (!createdAt || !id) {
    return null;
  }

  return { createdAt, id };
}

export async function listMyNotifications(
  notificationRepository: NotificationRepository,
  input: ListMyNotificationsInput,
): Promise<Result<ListMyNotificationsOutput, ListMyNotificationsError>> {
  const limit = normalizeLimit(input.limit);

  const parsedCursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  if (input.cursor && !parsedCursor) {
    return err(INVALID_NOTIFICATIONS_CURSOR_ERROR);
  }

  const listResult = await notificationRepository.listByRecipient({
    recipientUserId: input.viewerUserId,
    projectId: input.projectId,
    limit: limit + 1,
    cursor: parsedCursor ?? undefined,
    unreadOnly: input.unreadOnly,
    kinds: input.kinds,
  });

  if (listResult.isErr()) {
    return err(listResult.error);
  }

  const hasNext = listResult.value.length > limit;
  const notifications = hasNext
    ? listResult.value.slice(0, limit)
    : listResult.value;
  const lastNotification = notifications.at(-1);

  return ok({
    notifications,
    page: {
      hasNext,
      nextCursor:
        hasNext && lastNotification
          ? encodeCursor({
              createdAt: lastNotification.createdAt,
              id: lastNotification.id,
            })
          : null,
    },
  });
}
