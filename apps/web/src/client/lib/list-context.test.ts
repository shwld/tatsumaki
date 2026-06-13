import { describe, expect, it, beforeEach } from "vitest";
import {
  buildPathWithListContext,
  extractListContext,
  buildReturnPath,
  saveScrollPosition,
  restoreScrollPosition,
} from "./list-context";

describe("buildPathWithListContext", () => {
  it("returns base path when search params are empty", () => {
    const params = new URLSearchParams();
    expect(buildPathWithListContext("/projects/1/stories/2/edit", params)).toBe(
      "/projects/1/stories/2/edit",
    );
  });

  it("appends _list param with encoded search params", () => {
    const params = new URLSearchParams({
      status: "Started",
      point: "unestimated",
    });
    const result = buildPathWithListContext(
      "/projects/1/stories/2/edit",
      params,
    );
    expect(result).toContain("_list=");
    expect(result).toContain("status%3DStarted");
  });
});

describe("extractListContext", () => {
  it("returns empty string when _list is absent", () => {
    const params = new URLSearchParams({ foo: "bar" });
    expect(extractListContext(params)).toBe("");
  });

  it("returns decoded list context", () => {
    const params = new URLSearchParams({
      _list: "status=Started&point=unestimated",
    });
    expect(extractListContext(params)).toBe("status=Started&point=unestimated");
  });
});

describe("buildReturnPath", () => {
  it("returns base path when context is empty", () => {
    expect(buildReturnPath("/projects/1/stories", "")).toBe(
      "/projects/1/stories",
    );
  });

  it("appends context as query string", () => {
    expect(
      buildReturnPath(
        "/projects/1/stories",
        "status=Started&point=unestimated",
      ),
    ).toBe("/projects/1/stories?status=Started&point=unestimated");
  });
});

describe("scroll position persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("saves and restores scroll position", () => {
    // Mock scrollY
    Object.defineProperty(window, "scrollY", {
      value: 250,
      configurable: true,
    });
    saveScrollPosition("test-key");

    let scrolledTo = 0;
    Object.defineProperty(window, "scrollTo", {
      value: (_x: number, y: number) => {
        scrolledTo = y;
      },
      configurable: true,
    });

    const restored = restoreScrollPosition("test-key");
    expect(restored).toBe(true);
    expect(scrolledTo).toBe(250);
  });

  it("returns false when no saved position", () => {
    expect(restoreScrollPosition("nonexistent")).toBe(false);
  });
});
