import { useEffect, useState, type ReactNode } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Notification } from "../types/notification";
import {
  myNotificationsReadApiPath,
  myNotificationsApiPath,
  projectInvitationAcceptPath,
  projectStoryEditPath,
} from "../lib/story-routes";
import { useCurrentUser } from "../hooks/use-current-user";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/config";
import { useTheme } from "../hooks/use-theme";
import { Avatar } from "./avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type LayoutProps = {
  children: ReactNode;
};

function i18nLanguageToLocale(language: string): string {
  if (language === "en") return "en-US";
  return "ja-JP";
}

function dateTimeFormatter(language: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(i18nLanguageToLocale(language), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function notificationKindLabel(
  kind: Notification["kind"],
  t: (key: string) => string,
): string {
  switch (kind) {
    case "status_changed":
      return t("layout.notifications.kind.statusChanged");
    case "estimate_changed":
      return t("layout.notifications.kind.estimateChanged");
    case "comment_added":
      return t("layout.notifications.kind.commentAdded");
    case "mention":
      return t("layout.notifications.kind.mention");
    case "member_invitation":
      return t("layout.notifications.kind.memberInvitation");
    case "story_activity":
      return t("layout.notifications.kind.storyActivity");
  }
}

function resolveNotificationPath(notification: Notification): string | null {
  const projectId = notification.projectId;
  if (
    notification.kind === "member_invitation" &&
    notification.invitationId &&
    notification.invitationId.length > 0
  ) {
    return projectInvitationAcceptPath(projectId, notification.invitationId);
  }
  if (notification.storyId && notification.storyId.length > 0) {
    return projectStoryEditPath(projectId, notification.storyId);
  }
  return null;
}

export function Layout({ children }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const formatter = dateTimeFormatter(i18n.language);
  const { user, isLoading } = useCurrentUser();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState<
    "loadError" | null
  >(null);
  const { mode, setMode } = useTheme();

  useEffect(() => {
    if (!notificationOpen || !user) {
      return;
    }

    let ignore = false;

    const load = async () => {
      setIsLoadingNotifications(true);
      setNotificationError(null);

      try {
        const response = await fetch(myNotificationsApiPath({ limit: 50 }));
        if (!response.ok) {
          throw new Error("loadError");
        }
        const data = (await response.json()) as {
          notifications: Notification[];
          page: {
            nextCursor: string | null;
            hasNext: boolean;
          };
        };
        if (!ignore) {
          setNotifications(data.notifications);
        }

        if (data.notifications.length > 0) {
          await fetch(myNotificationsReadApiPath(), {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              notificationIds: data.notifications.map(
                (notification) => notification.id,
              ),
            }),
          });
        }
      } catch {
        if (!ignore) {
          setNotificationError("loadError");
          setNotifications([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingNotifications(false);
        }
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [notificationOpen, user]);

  return (
    <div className="flex h-dvh min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-text)] transition-colors">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            to="/projects"
            className="text-sm font-semibold text-[var(--color-text)]"
          >
            {t("app.name")}
          </Link>
          {!isLoading && user ? (
            <div className="relative flex items-center gap-3">
              <Popover
                open={notificationOpen}
                onOpenChange={(open) => setNotificationOpen(open)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
                    aria-expanded={notificationOpen}
                    aria-controls="notification-panel"
                    aria-label={t("layout.notifications.label")}
                  >
                    <Bell className="h-4 w-4" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  id="notification-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label={t("layout.notifications.label")}
                  align="end"
                  className="w-80 max-w-[90vw]"
                >
                  <header className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[var(--color-text)]">
                      {t("layout.notifications.label")}
                    </h2>
                    <button
                      type="button"
                      className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      onClick={() => setNotificationOpen(false)}
                    >
                      {t("layout.notifications.close")}
                    </button>
                  </header>
                  {notificationError ? (
                    <p className="rounded-md bg-red-50 px-2 py-2 text-xs text-red-700">
                      {t("layout.notifications.loadError")}
                    </p>
                  ) : isLoadingNotifications ? (
                    <p className="px-1 py-2 text-xs text-[var(--color-muted)]">
                      {t("layout.notifications.loading")}
                    </p>
                  ) : notifications.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-[var(--color-muted)]">
                      {t("layout.notifications.empty")}
                    </p>
                  ) : (
                    <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {notifications.map((notification) => (
                        <li
                          key={notification.id}
                          className="rounded-md border border-[var(--color-border)] px-2 py-2"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                              {notificationKindLabel(notification.kind, t)}
                            </span>
                            <time className="text-[10px] text-[var(--color-muted)]">
                              {formatDateWithLanguage(
                                notification.createdAt,
                                formatter,
                              )}
                            </time>
                          </div>
                          <p className="text-xs text-[var(--color-text)]">
                            <span className="font-medium">
                              {notification.actorName}
                            </span>
                            <span className="mx-1 text-[var(--color-muted)]">
                              |
                            </span>
                            {notification.message}
                          </p>
                          {(() => {
                            const to = resolveNotificationPath(notification);
                            if (!to) {
                              return null;
                            }
                            return (
                              <Link
                                to={to}
                                className="mt-1 block truncate text-xs text-blue-700 hover:underline"
                                onClick={() => setNotificationOpen(false)}
                              >
                                {notification.storyTitle ??
                                  t(
                                    "layout.notifications.fallbackInvitationTitle",
                                  )}
                              </Link>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
                    aria-label={t("layout.menu.userMenu")}
                  >
                    <Avatar
                      displayName={user.displayName}
                      avatarUrl={user.avatarUrl}
                      gravatarUrl={user.gravatarUrl}
                      size="sm"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    {t("layout.language.label")}
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={i18n.language}
                    onValueChange={(language) => {
                      if (
                        SUPPORTED_LANGUAGES.includes(
                          language as SupportedLanguage,
                        )
                      ) {
                        if (language !== i18n.language) {
                          void i18n.changeLanguage(language);
                        }
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="ja">
                      {t("layout.language.ja")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="en">
                      {t("layout.language.en")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>
                    {t("layout.menu.theme")}
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={mode}
                    onValueChange={(nextMode) => {
                      setMode(nextMode as "light" | "dark" | "system");
                    }}
                  >
                    <DropdownMenuRadioItem value="light">
                      {t("layout.menu.themeLight")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      {t("layout.menu.themeDark")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      {t("layout.menu.themeSystem")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/account">{t("layout.menu.account")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="/cdn-cgi/access/logout">
                      {t("layout.menu.logout")}
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function formatDateWithLanguage(
  isoString: string,
  formatter: Intl.DateTimeFormat,
): string {
  return formatter.format(new Date(isoString));
}
