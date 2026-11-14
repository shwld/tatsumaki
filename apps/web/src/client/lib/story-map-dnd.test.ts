import { describe, expect, it } from "vitest";

import { afterIdFor, sideOf } from "./story-map-dnd";

describe("afterIdFor", () => {
  const ids = ["a", "b", "c"];
  it("drops after the target", () => {
    expect(afterIdFor(ids, "a", "c", "after")).toBe("c");
  });
  it("drops before the target by naming its predecessor", () => {
    expect(afterIdFor(ids, "c", "b", "before")).toBe("a");
    expect(afterIdFor(ids, "c", "a", "before")).toBeNull();
  });
  it("skips the dragged element when it precedes the target", () => {
    expect(afterIdFor(ids, "a", "b", "before")).toBeNull();
  });
  it("appends when the target is in another container", () => {
    expect(afterIdFor(ids, "x", "zzz", "before")).toBe("c");
  });
});

describe("sideOf", () => {
  const rect = { left: 0, top: 0, width: 100, height: 40 };
  it("splits along the sorting axis", () => {
    expect(sideOf({ clientX: 10, clientY: 30 }, rect, "x")).toBe("before");
    expect(sideOf({ clientX: 90, clientY: 5 }, rect, "x")).toBe("after");
    expect(sideOf({ clientX: 10, clientY: 5 }, rect, "y")).toBe("before");
    expect(sideOf({ clientX: 10, clientY: 35 }, rect, "y")).toBe("after");
  });
});
