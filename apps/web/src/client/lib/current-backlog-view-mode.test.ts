import { afterEach, describe, expect, it } from "vitest";

describe("useCurrentBacklogViewMode", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("uses split mode by default", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useCurrentBacklogViewMode } = await import(
      "./current-backlog-view-mode"
    );

    const { result } = renderHook(() => useCurrentBacklogViewMode("user-1"));

    expect(result.current.mode).toBe("split");
  });

  it("toggles to combined and persists per user", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { useCurrentBacklogViewMode } = await import(
      "./current-backlog-view-mode"
    );

    const { result } = renderHook(() => useCurrentBacklogViewMode("user-1"));

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe("combined");
    expect(
      localStorage.getItem("tatsumaki:current-backlog-view-mode:user-1"),
    ).toContain('"mode":"combined"');
  });

  it("loads persisted mode for the same user only", async () => {
    localStorage.setItem(
      "tatsumaki:current-backlog-view-mode:user-a",
      JSON.stringify({ mode: "combined" }),
    );

    const { renderHook } = await import("@testing-library/react");
    const { useCurrentBacklogViewMode } = await import(
      "./current-backlog-view-mode"
    );

    const forUserA = renderHook(() => useCurrentBacklogViewMode("user-a"));
    const forUserB = renderHook(() => useCurrentBacklogViewMode("user-b"));

    expect(forUserA.result.current.mode).toBe("combined");
    expect(forUserB.result.current.mode).toBe("split");
  });
});
