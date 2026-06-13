import { useCallback, useEffect, useState } from "react";

export const CURRENT_BACKLOG_VIEW_MODES = ["split", "combined"] as const;
export type CurrentBacklogViewMode =
  (typeof CURRENT_BACKLOG_VIEW_MODES)[number];

const STORAGE_KEY_PREFIX = "tatsumaki:current-backlog-view-mode";

function storageKeyForUser(userId: string | null | undefined): string {
  return `${STORAGE_KEY_PREFIX}:${userId ?? "anonymous"}`;
}

function isViewMode(value: unknown): value is CurrentBacklogViewMode {
  return value === "split" || value === "combined";
}

function loadViewMode(
  userId: string | null | undefined,
): CurrentBacklogViewMode {
  try {
    const raw = localStorage.getItem(storageKeyForUser(userId));
    if (!raw) {
      return "split";
    }
    const parsed = JSON.parse(raw) as { mode?: unknown };
    return isViewMode(parsed.mode) ? parsed.mode : "split";
  } catch {
    return "split";
  }
}

function saveViewMode(
  userId: string | null | undefined,
  mode: CurrentBacklogViewMode,
): void {
  try {
    localStorage.setItem(storageKeyForUser(userId), JSON.stringify({ mode }));
  } catch {
    // ignore storage errors
  }
}

export function useCurrentBacklogViewMode(userId: string | null | undefined) {
  const [mode, setMode] = useState<CurrentBacklogViewMode>(() =>
    loadViewMode(userId),
  );

  useEffect(() => {
    setMode(loadViewMode(userId));
  }, [userId]);

  const setViewMode = useCallback(
    (nextMode: CurrentBacklogViewMode) => {
      setMode(nextMode);
      saveViewMode(userId, nextMode);
    },
    [userId],
  );

  const toggleMode = useCallback(() => {
    setMode((current) => {
      const next = current === "split" ? "combined" : "split";
      saveViewMode(userId, next);
      return next;
    });
  }, [userId]);

  return { mode, setMode: setViewMode, toggleMode };
}
