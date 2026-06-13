import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBreakpoint } from "./use-breakpoint";

describe("useBreakpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns lg for wide viewport", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("lg");
  });

  it("returns md for medium viewport", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(900);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("md");
  });

  it("returns sm for narrow viewport", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(500);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("sm");
  });

  it("updates on resize", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("lg");

    act(() => {
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(500);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe("sm");
  });
});
