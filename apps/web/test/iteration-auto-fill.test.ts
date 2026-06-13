import { describe, expect, it } from "vitest";
import { autoFillCurrentStoryIds } from "../src/domain/entities/iteration-auto-fill";

type TestStory = {
  id: string;
  type: "feature" | "bug" | "chore";
  storyPoint: number | null;
  position: number;
};

function makeStory(overrides: Partial<TestStory> & { id: string }): TestStory {
  return {
    type: "feature",
    storyPoint: null,
    position: 1,
    ...overrides,
  };
}

describe("autoFillCurrentStoryIds", () => {
  it("fills estimated features until velocity is reached", () => {
    const stories = [
      makeStory({ id: "s1", storyPoint: 3, position: 1 }),
      makeStory({ id: "s2", storyPoint: 5, position: 2 }),
      makeStory({ id: "s3", storyPoint: 4, position: 3 }),
      makeStory({ id: "s4", storyPoint: 2, position: 4 }),
    ];
    // velocity=10: s1(3) + s2(5) + s3(4) = 12 >= 10, stop
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1", "s2", "s3"]));
  });

  it("includes the feature that causes overflow (greedy fill)", () => {
    const stories = [
      makeStory({ id: "s1", storyPoint: 8, position: 1 }),
      makeStory({ id: "s2", storyPoint: 8, position: 2 }),
    ];
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1", "s2"]));
  });

  it("unestimated feature blocks further filling", () => {
    const stories = [
      makeStory({ id: "s1", storyPoint: 3, position: 1 }),
      makeStory({ id: "s2", storyPoint: null, position: 2 }), // blocker
      makeStory({ id: "s3", storyPoint: 2, position: 3 }),
    ];
    // s1 included, s2 blocks, s3 stays in Backlog
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1"]));
  });

  it("chore/bug included without consuming velocity", () => {
    const stories = [
      makeStory({ id: "s1", type: "feature", storyPoint: 3, position: 1 }),
      makeStory({ id: "s2", type: "chore", storyPoint: null, position: 2 }),
      makeStory({ id: "s3", type: "bug", storyPoint: null, position: 3 }),
      makeStory({ id: "s4", type: "feature", storyPoint: 5, position: 4 }),
    ];
    // velocity=10: s1(3) + chore + bug + s4(5) = 8 < 10, all included
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1", "s2", "s3", "s4"]));
  });

  it("chore/bug below unestimated feature stays in Backlog", () => {
    const stories = [
      makeStory({ id: "s1", type: "feature", storyPoint: 3, position: 1 }),
      makeStory({ id: "s2", type: "feature", storyPoint: null, position: 2 }), // blocker
      makeStory({ id: "s3", type: "chore", storyPoint: null, position: 3 }),
    ];
    // s1 included, s2 blocks, s3 (chore) stays in Backlog
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1"]));
  });

  it("chore/bug stops when velocity is exhausted", () => {
    const stories = [
      makeStory({ id: "s1", type: "feature", storyPoint: 10, position: 1 }),
      makeStory({ id: "s2", type: "chore", storyPoint: null, position: 2 }),
    ];
    // velocity=10: s1(10) >= 10, capacity exhausted, chore stays in Backlog
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1"]));
  });

  it("returns empty set when velocity is 0", () => {
    const stories = [makeStory({ id: "s1", storyPoint: 3, position: 1 })];
    const result = autoFillCurrentStoryIds(stories, 0);
    expect(result.size).toBe(0);
  });

  it("returns empty set for empty backlog", () => {
    const result = autoFillCurrentStoryIds([], 10);
    expect(result.size).toBe(0);
  });

  it("includes all features if total points are less than velocity", () => {
    const stories = [
      makeStory({ id: "s1", storyPoint: 2, position: 1 }),
      makeStory({ id: "s2", storyPoint: 3, position: 2 }),
    ];
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1", "s2"]));
  });

  it("respects position ordering", () => {
    const stories = [
      makeStory({ id: "s3", storyPoint: 1, position: 3 }),
      makeStory({ id: "s1", storyPoint: 8, position: 1 }),
      makeStory({ id: "s2", storyPoint: 3, position: 2 }),
    ];
    // velocity=10: sorted → s1(8) + s2(3) = 11 >= 10, stop
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1", "s2"]));
  });

  it("all unestimated features: first one blocks immediately", () => {
    const stories = [
      makeStory({ id: "s1", storyPoint: null, position: 1 }),
      makeStory({ id: "s2", storyPoint: null, position: 2 }),
    ];
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result.size).toBe(0);
  });

  it("chore-only backlog: all included within velocity scope", () => {
    const stories = [
      makeStory({ id: "s1", type: "chore", storyPoint: null, position: 1 }),
      makeStory({ id: "s2", type: "bug", storyPoint: null, position: 2 }),
    ];
    const result = autoFillCurrentStoryIds(stories, 10);
    expect(result).toEqual(new Set(["s1", "s2"]));
  });
});
