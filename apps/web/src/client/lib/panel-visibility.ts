import { useCallback, useMemo, useState } from "react";

export const PANEL_TYPES = ["Done", "Current", "Backlog", "Icebox"] as const;
export type PanelType = (typeof PANEL_TYPES)[number];

export const PANEL_LABELS: Record<PanelType, string> = {
  Done: "Done",
  Current: "Current Iteration",
  Backlog: "Backlog",
  Icebox: "Icebox",
};

const STORAGE_KEY = "tatsumaki:panel-visibility";

const DEFAULT_VISIBILITY: Record<PanelType, boolean> = {
  Done: false,
  Current: true,
  Backlog: true,
  Icebox: false,
};

function loadVisibility(): Record<PanelType, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return {
        Done:
          typeof parsed.Done === "boolean"
            ? parsed.Done
            : DEFAULT_VISIBILITY.Done,
        Current:
          typeof parsed.Current === "boolean"
            ? parsed.Current
            : DEFAULT_VISIBILITY.Current,
        Backlog:
          typeof parsed.Backlog === "boolean"
            ? parsed.Backlog
            : DEFAULT_VISIBILITY.Backlog,
        Icebox:
          typeof parsed.Icebox === "boolean"
            ? parsed.Icebox
            : DEFAULT_VISIBILITY.Icebox,
      };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_VISIBILITY };
}

function saveVisibility(visibility: Record<PanelType, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
  } catch {
    // ignore storage errors
  }
}

export function usePanelVisibility() {
  const [visibility, setVisibility] =
    useState<Record<PanelType, boolean>>(loadVisibility);

  const togglePanel = useCallback((panel: PanelType) => {
    setVisibility((prev) => {
      const next = { ...prev, [panel]: !prev[panel] };
      saveVisibility(next);
      return next;
    });
  }, []);

  const visiblePanels = useMemo(() => {
    return PANEL_TYPES.filter((panel) => visibility[panel]);
  }, [visibility]);

  return { visibility, togglePanel, visiblePanels };
}
