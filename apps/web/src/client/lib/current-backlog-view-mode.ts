import { useCallback, useState } from "react";

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
  const [state, setState] = useState(() => ({
    userId,
    mode: loadViewMode(userId),
  }));

  // userId 変更時に effect で同期すると、旧 mode のまま1回 commit されレイアウトがシフトする
  let mode = state.mode;
  if (state.userId !== userId) {
    mode = loadViewMode(userId);
    setState({ userId, mode });
  }

  const setViewMode = useCallback(
    (nextMode: CurrentBacklogViewMode) => {
      setState({ userId, mode: nextMode });
      saveViewMode(userId, nextMode);
    },
    [userId],
  );

  const toggleMode = useCallback(() => {
    const next = mode === "split" ? "combined" : "split";
    setState({ userId, mode: next });
    saveViewMode(userId, next);
  }, [userId, mode]);

  return { mode, setMode: setViewMode, toggleMode };
}
