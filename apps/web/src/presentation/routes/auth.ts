import { Hono } from "hono";
import {
  CURRENT_USER_EMAIL_REQUIRED_ERROR,
  getOrCreateCurrentUser,
} from "../../application/usecases/get-or-create-current-user";
import {
  CURRENT_USER_NOT_FOUND_ERROR,
  updateCurrentUser,
} from "../../application/usecases/update-current-user";
import {
  ACCOUNT_EMAIL_CONFIRMATION_MISMATCH_ERROR,
  ACCOUNT_HAS_SOLE_OWNER_PROJECTS_ERROR,
  ACCOUNT_NOT_FOUND_ERROR,
  type AccountHasSoleOwnerProjectsError,
  deleteAccount,
} from "../../application/usecases/delete-account";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import {
  INVALID_USER_DISPLAY_NAME_ERROR,
  INVALID_USER_EMAIL_ERROR,
} from "../../application/usecases/current-user-input";
import { USER_REPOSITORY_ERROR } from "../../domain/repositories/user-repository";
import { D1UserRepository } from "../../infrastructure/db/repositories/d1-user-repository";
import {
  uploadUserAvatar,
  USER_AVATAR_UPLOAD_ERROR,
  USER_AVATAR_NOT_FOUND_ERROR,
} from "../../application/usecases/upload-user-avatar";
import {
  getUserAvatarContent,
  USER_AVATAR_NOT_FOUND_ERROR as GET_AVATAR_NOT_FOUND,
  USER_AVATAR_DOWNLOAD_ERROR,
} from "../../application/usecases/get-user-avatar-content";
import { getOrCreateNotificationSettings } from "../../application/usecases/get-or-create-notification-settings";
import { INVALID_NOTIFICATION_TARGET_SCOPE_ERROR } from "../../application/usecases/notification-settings-input";
import {
  NOTIFICATION_SETTINGS_NOT_FOUND_ERROR,
  updateNotificationSettings,
} from "../../application/usecases/update-notification-settings";
import { D1NotificationSettingsRepository } from "../../infrastructure/db/repositories/d1-notification-settings-repository";
import {
  INVALID_NOTIFICATIONS_CURSOR_ERROR,
  listMyNotifications,
} from "../../application/usecases/list-my-notifications";
import { markMyNotificationsRead } from "../../application/usecases/mark-my-notifications-read";
import { NOTIFICATION_KINDS } from "../../domain/entities/notification";
import { D1NotificationRepository } from "../../infrastructure/db/repositories/d1-notification-repository";
import { R2UserAvatarObjectStore } from "../../infrastructure/storage/r2-user-avatar-object-store";
import { InMemoryUserAvatarObjectStore } from "../../infrastructure/storage/in-memory-user-avatar-object-store";
import type { UserAvatarObjectStore } from "../../application/ports/user-avatar-object-store";
import type { Env } from "../../index";
import { ACCESS_LOGOUT_PATH, resolveAccessUrl } from "../cloudflare-access";
import { computeGravatarHash } from "../lib/gravatar";

export const authRoute = new Hono<Env>();

function userAvatarApiPath(userId: string): string {
  return `/api/auth/users/${userId}/avatar`;
}

function createUserAvatarObjectStore(
  bucket: R2Bucket | undefined,
): UserAvatarObjectStore {
  if (!bucket) {
    return new InMemoryUserAvatarObjectStore();
  }
  return new R2UserAvatarObjectStore(bucket);
}

authRoute.get("/auth/me", async (c) => {
  const user = c.get("currentUser");
  const repository = new D1UserRepository(c.env.DB);
  const result = await getOrCreateCurrentUser(repository, {
    id: user.id,
    accessEmail: user.email,
  });

  if (result.isErr()) {
    if (result.error === CURRENT_USER_EMAIL_REQUIRED_ERROR) {
      return c.json(
        { error: "アカウント初期化に必要なメールアドレスが見つかりません" },
        400,
      );
    }

    return c.json({ error: "アカウント情報の取得に失敗しました" }, 500);
  }

  const userEntity = result.value;
  const gravatarHash = await computeGravatarHash(userEntity.email);

  return c.json({
    ...userEntity,
    avatarUrl: userAvatarApiPath(userEntity.id),
    gravatarUrl: `https://gravatar.com/avatar/${gravatarHash}?d=404`,
  });
});

authRoute.patch("/auth/me", async (c) => {
  let body: { displayName?: unknown; email?: unknown };

  try {
    body = await c.req.json<{ displayName?: unknown; email?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const displayName =
    typeof body.displayName === "string" ? body.displayName : "";
  const email = typeof body.email === "string" ? body.email : "";
  const repository = new D1UserRepository(c.env.DB);
  const currentUser = c.get("currentUser");
  const result = await updateCurrentUser(repository, {
    id: currentUser.id,
    displayName,
    email,
  });

  if (result.isErr()) {
    if (result.error === INVALID_USER_DISPLAY_NAME_ERROR) {
      return c.json(
        {
          error: "入力内容を修正してください",
          errors: { displayName: "表示名を入力してください" },
        },
        400,
      );
    }

    if (result.error === INVALID_USER_EMAIL_ERROR) {
      return c.json(
        {
          error: "入力内容を修正してください",
          errors: { email: "有効なメールアドレスを入力してください" },
        },
        400,
      );
    }

    if (result.error === CURRENT_USER_NOT_FOUND_ERROR) {
      return c.json({ error: "アカウント情報が見つかりません" }, 404);
    }

    if (result.error === USER_REPOSITORY_ERROR) {
      return c.json({ error: "アカウント情報の更新に失敗しました" }, 500);
    }
  }

  const userEntity = result._unsafeUnwrap();
  const gravatarHash = await computeGravatarHash(userEntity.email);

  return c.json({
    ...userEntity,
    avatarUrl: userAvatarApiPath(userEntity.id),
    gravatarUrl: `https://gravatar.com/avatar/${gravatarHash}?d=404`,
  });
});

authRoute.post("/auth/me/avatar", async (c) => {
  const formData = await c.req.formData().catch(() => null);
  if (!formData) {
    return c.json({ error: "Invalid form data" }, 400);
  }

  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return c.json({ error: "avatar field is required" }, 400);
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return c.json(
      {
        error: "画像ファイル（JPEG、PNG、GIF、WebP）のみアップロードできます",
      },
      400,
    );
  }

  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: "ファイルサイズは5MB以下にしてください" }, 400);
  }

  const currentUser = c.get("currentUser");
  const repository = new D1UserRepository(c.env.DB);
  const objectStore = createUserAvatarObjectStore(c.env.USER_AVATARS);
  const result = await uploadUserAvatar(repository, objectStore, {
    userId: currentUser.id,
    mimeType: file.type,
    fileBody: file.stream(),
  });

  if (result.isErr()) {
    if (result.error === USER_AVATAR_NOT_FOUND_ERROR) {
      return c.json({ error: "アカウント情報が見つかりません" }, 404);
    }
    if (result.error === USER_AVATAR_UPLOAD_ERROR) {
      return c.json({ error: "アバター画像のアップロードに失敗しました" }, 500);
    }
    return c.json({ error: "アバター画像の更新に失敗しました" }, 500);
  }

  const userEntity = result.value;
  const gravatarHash = await computeGravatarHash(userEntity.email);

  return c.json({
    ...userEntity,
    avatarUrl: userAvatarApiPath(userEntity.id),
    gravatarUrl: `https://gravatar.com/avatar/${gravatarHash}?d=404`,
  });
});

authRoute.get("/auth/me/avatar", async (c) => {
  const currentUser = c.get("currentUser");
  const objectStore = createUserAvatarObjectStore(c.env.USER_AVATARS);

  const result = await getUserAvatarContent(objectStore, currentUser.id);

  if (result.isErr()) {
    if (result.error === GET_AVATAR_NOT_FOUND) {
      return c.json({ error: "アバター画像が見つかりません" }, 404);
    }
    if (result.error === USER_AVATAR_DOWNLOAD_ERROR) {
      return c.json({ error: "アバター画像の取得に失敗しました" }, 500);
    }
    return c.json({ error: "アバター画像の取得に失敗しました" }, 500);
  }

  const object = result.value;
  c.header("content-type", object.contentType ?? "application/octet-stream");
  c.header("cache-control", "private, max-age=3600");
  if (object.httpEtag) {
    c.header("etag", object.httpEtag);
  }

  return c.body(object.body);
});

authRoute.get("/auth/users/:userId/avatar", async (c) => {
  const userId = c.req.param("userId");
  const objectStore = createUserAvatarObjectStore(c.env.USER_AVATARS);

  const result = await getUserAvatarContent(objectStore, userId);

  if (result.isErr()) {
    if (result.error === GET_AVATAR_NOT_FOUND) {
      return c.json({ error: "アバター画像が見つかりません" }, 404);
    }
    if (result.error === USER_AVATAR_DOWNLOAD_ERROR) {
      return c.json({ error: "アバター画像の取得に失敗しました" }, 500);
    }
    return c.json({ error: "アバター画像の取得に失敗しました" }, 500);
  }

  const object = result.value;
  c.header("content-type", object.contentType ?? "application/octet-stream");
  c.header("cache-control", "private, max-age=3600");
  if (object.httpEtag) {
    c.header("etag", object.httpEtag);
  }

  return c.body(object.body);
});

authRoute.get("/auth/me/notification-settings", async (c) => {
  const currentUser = c.get("currentUser");
  const userRepository = new D1UserRepository(c.env.DB);
  const userResult = await getOrCreateCurrentUser(userRepository, {
    id: currentUser.id,
    accessEmail: currentUser.email,
  });

  if (userResult.isErr()) {
    if (userResult.error === CURRENT_USER_EMAIL_REQUIRED_ERROR) {
      return c.json(
        { error: "アカウント初期化に必要なメールアドレスが見つかりません" },
        400,
      );
    }
    return c.json({ error: "通知設定の取得に失敗しました" }, 500);
  }

  const repository = new D1NotificationSettingsRepository(c.env.DB);
  const settingsResult = await getOrCreateNotificationSettings(repository, {
    userId: userResult.value.id,
  });

  if (settingsResult.isErr()) {
    return c.json({ error: "通知設定の取得に失敗しました" }, 500);
  }

  return c.json(settingsResult.value);
});

authRoute.patch("/auth/me/notification-settings", async (c) => {
  let body: {
    emailEnabled?: unknown;
    targetScope?: unknown;
    notifyOnStatusChanged?: unknown;
    notifyOnComment?: unknown;
    notifyOnEstimate?: unknown;
  };

  try {
    body = await c.req.json<{
      emailEnabled?: unknown;
      targetScope?: unknown;
      notifyOnStatusChanged?: unknown;
      notifyOnComment?: unknown;
      notifyOnEstimate?: unknown;
    }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const emailEnabled =
    typeof body.emailEnabled === "boolean" ? body.emailEnabled : undefined;
  const targetScope =
    typeof body.targetScope === "string" ? body.targetScope : undefined;
  const notifyOnStatusChanged =
    typeof body.notifyOnStatusChanged === "boolean"
      ? body.notifyOnStatusChanged
      : undefined;
  const notifyOnComment =
    typeof body.notifyOnComment === "boolean"
      ? body.notifyOnComment
      : undefined;
  const notifyOnEstimate =
    typeof body.notifyOnEstimate === "boolean"
      ? body.notifyOnEstimate
      : undefined;

  const currentUser = c.get("currentUser");
  const userRepository = new D1UserRepository(c.env.DB);
  const userResult = await getOrCreateCurrentUser(userRepository, {
    id: currentUser.id,
    accessEmail: currentUser.email,
  });

  if (userResult.isErr()) {
    if (userResult.error === CURRENT_USER_EMAIL_REQUIRED_ERROR) {
      return c.json(
        { error: "アカウント初期化に必要なメールアドレスが見つかりません" },
        400,
      );
    }
    return c.json({ error: "通知設定の更新に失敗しました" }, 500);
  }

  const repository = new D1NotificationSettingsRepository(c.env.DB);
  const ensureResult = await getOrCreateNotificationSettings(repository, {
    userId: userResult.value.id,
  });
  if (ensureResult.isErr()) {
    return c.json({ error: "通知設定の更新に失敗しました" }, 500);
  }

  const result = await updateNotificationSettings(repository, {
    userId: userResult.value.id,
    emailEnabled,
    targetScope,
    notifyOnStatusChanged,
    notifyOnComment,
    notifyOnEstimate,
  });

  if (result.isErr()) {
    if (result.error === INVALID_NOTIFICATION_TARGET_SCOPE_ERROR) {
      return c.json(
        {
          error: "入力内容を修正してください",
          errors: {
            targetScope:
              "通知対象は「自分の担当のみ」または「全ストーリー」から選択してください",
          },
        },
        400,
      );
    }
    if (result.error === NOTIFICATION_SETTINGS_NOT_FOUND_ERROR) {
      return c.json({ error: "通知設定が見つかりません" }, 404);
    }
    return c.json({ error: "通知設定の更新に失敗しました" }, 500);
  }

  return c.json(result.value);
});

authRoute.get("/auth/me/notifications", async (c) => {
  const projectId = c.req.query("projectId");

  const parsedLimit = Number.parseInt(c.req.query("limit") ?? "50", 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 50;
  const cursor = c.req.query("cursor");
  const unreadOnlyRaw = c.req.query("unreadOnly");
  const unreadOnly =
    unreadOnlyRaw === "true" || unreadOnlyRaw === "1"
      ? true
      : unreadOnlyRaw === "false" || unreadOnlyRaw === "0"
        ? false
        : undefined;

  const kindsRaw = c.req.query("kinds");
  const kindValues = kindsRaw
    ? kindsRaw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];
  const invalidKinds = kindValues.filter(
    (value) =>
      !NOTIFICATION_KINDS.includes(
        value as (typeof NOTIFICATION_KINDS)[number],
      ),
  );
  if (invalidKinds.length > 0) {
    return c.json({ error: "kinds contains unsupported values" }, 400);
  }
  const kinds = kindValues as (typeof NOTIFICATION_KINDS)[number][];

  const currentUser = c.get("currentUser");
  const userRepository = new D1UserRepository(c.env.DB);
  const userResult = await getOrCreateCurrentUser(userRepository, {
    id: currentUser.id,
    accessEmail: currentUser.email,
  });
  if (userResult.isErr()) {
    if (userResult.error === CURRENT_USER_EMAIL_REQUIRED_ERROR) {
      return c.json(
        { error: "アカウント初期化に必要なメールアドレスが見つかりません" },
        400,
      );
    }
    return c.json({ error: "通知一覧の取得に失敗しました" }, 500);
  }

  const notificationsResult = await listMyNotifications(
    new D1NotificationRepository(c.env.DB),
    {
      projectId,
      viewerUserId: userResult.value.id,
      limit,
      cursor,
      unreadOnly,
      kinds,
    },
  );

  if (notificationsResult.isErr()) {
    if (notificationsResult.error === INVALID_NOTIFICATIONS_CURSOR_ERROR) {
      return c.json({ error: "cursor is invalid" }, 400);
    }
    return c.json({ error: "通知一覧の取得に失敗しました" }, 500);
  }

  return c.json(notificationsResult.value);
});

authRoute.post("/auth/me/notifications/read", async (c) => {
  let body: { notificationIds?: unknown };
  try {
    body = await c.req.json<{ notificationIds?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body.notificationIds)) {
    return c.json({ error: "notificationIds must be an array" }, 400);
  }

  const notificationIds = body.notificationIds.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  const currentUser = c.get("currentUser");
  const userRepository = new D1UserRepository(c.env.DB);
  const userResult = await getOrCreateCurrentUser(userRepository, {
    id: currentUser.id,
    accessEmail: currentUser.email,
  });
  if (userResult.isErr()) {
    if (userResult.error === CURRENT_USER_EMAIL_REQUIRED_ERROR) {
      return c.json(
        { error: "アカウント初期化に必要なメールアドレスが見つかりません" },
        400,
      );
    }
    return c.json({ error: "通知既読化に失敗しました" }, 500);
  }

  const readResult = await markMyNotificationsRead(
    new D1NotificationRepository(c.env.DB),
    {
      viewerUserId: userResult.value.id,
      notificationIds,
    },
  );
  if (readResult.isErr()) {
    return c.json({ error: "通知既読化に失敗しました" }, 500);
  }

  return c.json({ updatedCount: readResult.value });
});

authRoute.delete("/auth/me", async (c) => {
  let body: { confirmEmail?: unknown };
  try {
    body = await c.req.json<{ confirmEmail?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const confirmEmail =
    typeof body.confirmEmail === "string" ? body.confirmEmail : "";

  const currentUser = c.get("currentUser");
  const userRepository = new D1UserRepository(c.env.DB);
  const projectRepository = new D1ProjectRepository(c.env.DB);

  const result = await deleteAccount(userRepository, projectRepository, {
    userId: currentUser.id,
    confirmEmail,
  });

  if (result.isErr()) {
    if (result.error === ACCOUNT_NOT_FOUND_ERROR) {
      return c.json({ error: "アカウントが見つかりません" }, 404);
    }
    if (result.error === ACCOUNT_EMAIL_CONFIRMATION_MISMATCH_ERROR) {
      return c.json({ error: "メールアドレスが一致しません" }, 422);
    }
    if (
      typeof result.error === "object" &&
      result.error.type === ACCOUNT_HAS_SOLE_OWNER_PROJECTS_ERROR
    ) {
      const soleOwnerError = result.error as AccountHasSoleOwnerProjectsError;
      return c.json(
        {
          error:
            "あなただけがオーナーのプロジェクトが存在します。先にオーナーを移譲するかプロジェクトを削除してください。",
          code: ACCOUNT_HAS_SOLE_OWNER_PROJECTS_ERROR,
          projects: soleOwnerError.projects,
        },
        409,
      );
    }
    return c.json({ error: "アカウントの削除に失敗しました" }, 500);
  }

  const teamDomain = c.env.ACCESS_TEAM_DOMAIN;
  if (teamDomain) {
    return c.redirect(resolveAccessUrl(teamDomain, ACCESS_LOGOUT_PATH), 302);
  }

  return c.json({ ok: true }, 200);
});
