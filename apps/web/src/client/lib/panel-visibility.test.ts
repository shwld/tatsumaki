import { afterEach, describe, expect, it } from "vitest";
import { PANEL_LABELS, PANEL_TYPES } from "./panel-visibility";

describe("PANEL_TYPES", () => {
  it("contains all four panels", () => {
    expect(PANEL_TYPES).toEqual(["Done", "Current", "Backlog", "Icebox"]);
  });
});

describe("PANEL_LABELS", () => {
  it("maps all panel types to labels", () => {
    for (const panel of PANEL_TYPES) {
      expect(typeof PANEL_LABELS[panel]).toBe("string");
    }
  });
});

describe("usePanelVisibility persistence", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("loads default visibility when localStorage is empty", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { usePanelVisibility } = await import("./panel-visibility");

    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.visibility.Current).toBe(true);
    expect(result.current.visibility.Backlog).toBe(true);
    expect(result.current.visibility.Done).toBe(false);
    expect(result.current.visibility.Icebox).toBe(false);
  });

  it("toggles panel visibility and persists to localStorage", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { usePanelVisibility } = await import("./panel-visibility");

    const { result } = renderHook(() => usePanelVisibility());

    act(() => {
      result.current.togglePanel("Done");
    });

    expect(result.current.visibility.Done).toBe(true);
    expect(localStorage.getItem("tatsumaki:panel-visibility")).toContain(
      '"Done":true',
    );
  });

  it("returns visible panels only", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { usePanelVisibility } = await import("./panel-visibility");

    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.visiblePanels).toEqual(["Current", "Backlog"]);
  });
});

describe("useShowStoryLabels persistence", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to off, toggles, and persists", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { useShowStoryLabels } = await import("./panel-visibility");

    const first = renderHook(() => useShowStoryLabels());
    expect(first.result.current.showLabels).toBe(false);

    act(() => {
      first.result.current.toggleShowLabels();
    });
    expect(first.result.current.showLabels).toBe(true);

    const second = renderHook(() => useShowStoryLabels());
    expect(second.result.current.showLabels).toBe(true);
  });
});
