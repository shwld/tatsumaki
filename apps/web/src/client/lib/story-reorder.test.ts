import { describe, expect, it } from "vitest";
import {
  insertStoryAtDropTarget,
  reindexStoriesPosition,
  reorderStoriesById,
} from "./story-reorder";

const items = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];

describe("reorderStoriesById", () => {
  it("moves item forward", () => {
    const result = reorderStoriesById(items, "a", "c");
    expect(result?.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("moves item backward", () => {
    const result = reorderStoriesById(items, "c", "a");
    expect(result?.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("returns null when activeId not found", () => {
    expect(reorderStoriesById(items, "x", "a")).toBeNull();
  });

  it("returns null when overId not found", () => {
    expect(reorderStoriesById(items, "a", "x")).toBeNull();
  });

  it("returns null when same id", () => {
    expect(reorderStoriesById(items, "a", "a")).toBeNull();
  });

  it("does not mutate original array", () => {
    const original = [...items];
    reorderStoriesById(items, "a", "c");
    expect(items).toEqual(original);
  });
});

describe("insertStoryAtDropTarget", () => {
  it("inserts a cross-panel story before a release marker target", () => {
    const release = { id: "release", position: 2 };
    const moved = { id: "moved", position: 10 };

    expect(insertStoryAtDropTarget([release], moved, release.id)).toEqual([
      moved,
      release,
    ]);
  });

  it("inserts at the start for a Current sprint group drop zone", () => {
    const release = { id: "release", position: 2 };
    const moved = { id: "moved", position: 10 };

    expect(
      insertStoryAtDropTarget(
        [release],
        moved,
        "drop-zone-group:Current:iter-current",
      ),
    ).toEqual([moved, release]);
  });

  it("supports an empty destination when Current only has Accepted stories", () => {
    const moved = { id: "moved", position: 10 };

    expect(
      insertStoryAtDropTarget(
        [],
        moved,
        "drop-zone-group:Current:iter-current",
      ),
    ).toEqual([moved]);
  });
});

describe("reindexStoriesPosition", () => {
  it("reindexes stories to sequential positions", () => {
    const stories = [
      { id: "a", position: 10 },
      { id: "b", position: 20 },
      { id: "c", position: 30 },
    ];

    const result = reindexStoriesPosition(stories);

    expect(result.map((story) => story.position)).toEqual([1, 2, 3]);
  });

  it("reuses references when positions are already sequential", () => {
    const stories = [
      { id: "a", position: 1 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
    ];

    const result = reindexStoriesPosition(stories);

    expect(result[0]).toBe(stories[0]);
    expect(result[1]).toBe(stories[1]);
    expect(result[2]).toBe(stories[2]);
  });
});
