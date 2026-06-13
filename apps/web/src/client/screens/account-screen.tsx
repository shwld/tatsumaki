import { type FormEvent, useEffect, useRef, useState } from "react";
import type { CurrentUser } from "../types/current-user";
import type { NotificationSettings } from "../types/notification-settings";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import { Avatar } from "../components/avatar";
import { DeleteAccountDialog } from "../components/delete-account-dialog";

type AccountResponse = CurrentUser & {
  error?: string;
  errors?: {
    displayName?: string;
    email?: string;
  };
};

type NotificationSettingsResponse = NotificationSettings & {
  error?: string;
  errors?: {
    targetScope?: string;
  };
};

export function AccountScreen() {
  const { notifySessionExpired } = useAuthError();
  const [account, setAccount] = useState<CurrentUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{
    displayName?: string;
    email?: string;
  }>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings | null>(null);
  const [notificationErrors, setNotificationErrors] = useState<{
    targetScope?: string;
  }>({});
  const [notificationRequestError, setNotificationRequestError] = useState<
    string | null
  >(null);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ignore = false;

    const run = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) {
          if (!ignore && isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          if (!ignore) {
            setRequestError(await parseErrorMessage(response));
          }
          return;
        }

        const data = (await response.json()) as CurrentUser;
        if (!ignore) {
          setAccount(data);
          setDisplayName(data.displayName);
          setEmail(data.email);
        }

        try {
          const settingsResponse = await fetch(
            "/api/auth/me/notification-settings",
          );
          if (!settingsResponse.ok) {
            if (!ignore && isAuthError(settingsResponse.status)) {
              notifySessionExpired();
              return;
            }
            if (!ignore) {
              setNotificationRequestError(
                await parseErrorMessage(settingsResponse),
              );
            }
            return;
          }

          const settingsData =
            (await settingsResponse.json()) as NotificationSettings;
          if (!ignore) {
            setNotificationSettings(settingsData);
          }
        } catch {
          if (!ignore) {
            setNotificationRequestError("通知設定の読み込みに失敗しました");
          }
        }
      } catch {
        if (!ignore) {
          setRequestError("アカウント情報の読み込みに失敗しました");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      ignore = true;
    };
  }, [notifySessionExpired]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setErrors({});
    setRequestError(null);

    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email }),
      });

      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }

      const data = (await response.json()) as AccountResponse;

      if (!response.ok) {
        setErrors(data.errors ?? {});
        setRequestError(data.error ?? "アカウント情報の更新に失敗しました");
        return;
      }

      setAccount(data);
      setDisplayName(data.displayName);
      setEmail(data.email);
    } catch {
      setRequestError("アカウント情報の更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setAvatarError(null);

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/auth/me/avatar", {
        method: "POST",
        body: formData,
      });

      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }

      const data = (await response.json()) as AccountResponse;

      if (!response.ok) {
        setAvatarError(
          data.error ?? "アバター画像のアップロードに失敗しました",
        );
        return;
      }

      setAccount(data);
    } catch {
      setAvatarError("アバター画像のアップロードに失敗しました");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleNotificationSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!notificationSettings || isSavingNotifications) return;

    setIsSavingNotifications(true);
    setNotificationErrors({});
    setNotificationRequestError(null);

    try {
      const response = await fetch("/api/auth/me/notification-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emailEnabled: notificationSettings.emailEnabled,
          targetScope: notificationSettings.targetScope,
          notifyOnStatusChanged: notificationSettings.notifyOnStatusChanged,
          notifyOnComment: notificationSettings.notifyOnComment,
          notifyOnEstimate: notificationSettings.notifyOnEstimate,
        }),
      });

      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }

      const data = (await response.json()) as NotificationSettingsResponse;
      if (!response.ok) {
        setNotificationErrors(data.errors ?? {});
        setNotificationRequestError(
          data.error ?? "通知設定の更新に失敗しました",
        );
        return;
      }

      setNotificationSettings(data);
    } catch {
      setNotificationRequestError("通知設定の更新に失敗しました");
    } finally {
      setIsSavingNotifications(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
          Account
        </p>
        <h1 className="text-3xl font-semibold text-gray-900">アカウント情報</h1>
        <p className="text-sm text-gray-600">
          表示名と連絡先メールアドレスを更新できます。
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-gray-600">読み込み中...</p>
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {account ? (
              <Avatar
                displayName={account.displayName}
                avatarUrl={account.avatarUrl}
                gravatarUrl={account.gravatarUrl}
                size="lg"
              />
            ) : null}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">
                プロフィール画像
              </p>
              <p className="text-xs text-gray-500">
                JPEG、PNG、GIF、WebP（最大5MB）。未設定時はGravatarまたはイニシャルが表示されます。
              </p>
              <label
                htmlFor="avatar-upload"
                className="inline-block cursor-pointer rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                {isUploadingAvatar ? "アップロード中..." : "画像を変更"}
              </label>
              <input
                id="avatar-upload"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                onChange={handleAvatarChange}
                disabled={isUploadingAvatar}
              />
              {avatarError ? (
                <p className="text-sm text-red-600" role="alert">
                  {avatarError}
                </p>
              ) : null}
            </div>
          </div>

          <form
            className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <label
                htmlFor="display-name"
                className="text-sm font-medium text-gray-900"
              >
                表示名
              </label>
              <input
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  errors.displayName ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.displayName ? (
                <p className="text-sm text-red-600">{errors.displayName}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="account-email"
                className="text-sm font-medium text-gray-900"
              >
                メールアドレス
              </label>
              <input
                id="account-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  errors.email ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.email ? (
                <p className="text-sm text-red-600">{errors.email}</p>
              ) : null}
            </div>

            {requestError ? (
              <p className="text-sm text-red-600" role="alert">
                {requestError}
              </p>
            ) : null}

            <section className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-4">
              <h2 className="text-sm font-semibold text-gray-900">
                パスワードとサインイン情報
              </h2>
              <p className="text-xs leading-5 text-gray-600">
                tatsumaki では Cloudflare Access
                を利用しています。パスワードのリセットや変更は Access
                側の認証フローで実行してください。
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/cdn-cgi/access/login"
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  パスワードリセットを開始
                </a>
                <a
                  href="/cdn-cgi/access/logout"
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  再認証して変更
                </a>
              </div>
            </section>

            <div className="space-y-1 border-t border-gray-100 pt-4 text-sm text-gray-500">
              <p>ユーザーID: {account?.id}</p>
              <p>更新は再読み込み後も保持されます。</p>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "保存中..." : "保存する"}
            </button>
          </form>

          <form
            className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            onSubmit={handleNotificationSubmit}
          >
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-gray-900">通知設定</h2>
              <p className="text-sm text-gray-600">
                メール通知の頻度と対象を調整できます。
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-900">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={notificationSettings?.emailEnabled ?? false}
                onChange={(event) =>
                  setNotificationSettings((current) =>
                    current
                      ? {
                          ...current,
                          emailEnabled: event.target.checked,
                        }
                      : current,
                  )
                }
              />
              メール通知を有効にする
            </label>

            <div className="space-y-2">
              <label
                htmlFor="notification-target-scope"
                className="text-sm font-medium text-gray-900"
              >
                通知対象
              </label>
              <select
                id="notification-target-scope"
                value={notificationSettings?.targetScope ?? "assigned_only"}
                onChange={(event) =>
                  setNotificationSettings((current) =>
                    current
                      ? {
                          ...current,
                          targetScope: event.target
                            .value as NotificationSettings["targetScope"],
                        }
                      : current,
                  )
                }
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  notificationErrors.targetScope
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
              >
                <option value="assigned_only">自分の担当のみ</option>
                <option value="all_stories">全ストーリー</option>
              </select>
              {notificationErrors.targetScope ? (
                <p className="text-sm text-red-600">
                  {notificationErrors.targetScope}
                </p>
              ) : null}
            </div>

            <fieldset className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-4">
              <legend className="px-1 text-sm font-medium text-gray-900">
                通知トリガー
              </legend>
              <label className="flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={notificationSettings?.notifyOnStatusChanged ?? false}
                  onChange={(event) =>
                    setNotificationSettings((current) =>
                      current
                        ? {
                            ...current,
                            notifyOnStatusChanged: event.target.checked,
                          }
                        : current,
                    )
                  }
                />
                ステータス変更
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={notificationSettings?.notifyOnComment ?? false}
                  onChange={(event) =>
                    setNotificationSettings((current) =>
                      current
                        ? {
                            ...current,
                            notifyOnComment: event.target.checked,
                          }
                        : current,
                    )
                  }
                />
                コメント
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={notificationSettings?.notifyOnEstimate ?? false}
                  onChange={(event) =>
                    setNotificationSettings((current) =>
                      current
                        ? {
                            ...current,
                            notifyOnEstimate: event.target.checked,
                          }
                        : current,
                    )
                  }
                />
                見積もり
              </label>
            </fieldset>

            {notificationRequestError ? (
              <p className="text-sm text-red-600" role="alert">
                {notificationRequestError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSavingNotifications || !notificationSettings}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingNotifications ? "保存中..." : "通知設定を保存する"}
            </button>
          </form>
          <section className="space-y-4 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-red-700">危険な操作</h2>
              <p className="text-sm text-gray-600">
                アカウントを削除すると、個人データが削除されます。過去の活動履歴上の表示名は記録として残ります。この操作は取り消せません。
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              アカウントを削除する
            </button>
          </section>

          {account ? (
            <DeleteAccountDialog
              isOpen={isDeleteDialogOpen}
              userEmail={account.email}
              onCancel={() => setIsDeleteDialogOpen(false)}
            />
          ) : null}
        </>
      )}
    </main>
  );
}
