import { describe, expect, it } from "vitest";
import {
  determinePanelForStory,
  groupStoriesByIteration,
  resolveDropTargetPanel,
} from "../src/client/lib/story-panel-grouping";
import type { Iteration } from "../src/client/types/iteration";
import type { Story } from "../src/client/types/story";

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    __typename: "Story",
    id: "story-1",
    projectId: "proj-1",
    title: "Test story",
    description: "",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: "2026-01-01T00:00:00Z",
    storyPoint: null,
    labels: [],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
    storyNumber: overrides.storyNumber ?? 1,
  };
}

function makeIteration(
  id: string,
  startDate: string,
  endDate = "2026-01-14",
): Iteration {
  return {
    __typename: "Iteration",
    id,
    projectId: "proj-1",
    startDate,
    endDate,
    totalPoints: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("determinePanelForStory", () => {
  it("returns Done for Accepted status", () => {
    const story = makeStory({ status: "Accepted" });
    expect(determinePanelForStory(story)).toBe("Done");
  });

  it("returns Done for Accepted even with iterationId", () => {
    const story = makeStory({ status: "Accepted", iterationId: "iter-1" });
    expect(
      determinePanelForStory(story, { currentIterationId: "iter-1" }),
    ).toBe("Current");
  });

  it("returns Current when iterationId matches currentIterationId", () => {
    const story = makeStory({ iterationId: "iter-1" });
    expect(
      determinePanelForStory(story, { currentIterationId: "iter-1" }),
    ).toBe("Current");
  });

  it("returns Backlog when iterationId is a future iteration", () => {
    const story = makeStory({ iterationId: "iter-future" });
    expect(
      determinePanelForStory(story, { currentIterationId: "iter-current" }),
    ).toBe("Backlog");
  });

  it("returns Icebox when isIcebox is true", () => {
    const story = makeStory({ isIcebox: true });
    expect(determinePanelForStory(story)).toBe("Icebox");
  });

  it("returns Backlog by default", () => {
    const story = makeStory();
    expect(determinePanelForStory(story)).toBe("Backlog");
  });

  it("prioritizes current iteration over Done for Accepted stories", () => {
    const story = makeStory({ status: "Accepted", iterationId: "iter-1" });
    expect(
      determinePanelForStory(story, { currentIterationId: "iter-1" }),
    ).toBe("Current");
  });

  it("prioritizes iterationId over isIcebox", () => {
    const story = makeStory({
      iterationId: "iter-1",
      isIcebox: true,
    });
    expect(
      determinePanelForStory(story, { currentIterationId: "iter-1" }),
    ).toBe("Current");
  });
});

describe("determinePanelForStory with in-progress statuses", () => {
  it("returns Current for Started status", () => {
    const story = makeStory({ status: "Started" });
    expect(determinePanelForStory(story)).toBe("Current");
  });

  it("returns Current for Finished status", () => {
    const story = makeStory({ status: "Finished" });
    expect(determinePanelForStory(story)).toBe("Current");
  });

  it("returns Current for Delivered status", () => {
    const story = makeStory({ status: "Delivered" });
    expect(determinePanelForStory(story)).toBe("Current");
  });

  it("returns Icebox for Started + isIcebox", () => {
    const story = makeStory({ status: "Started", isIcebox: true });
    expect(determinePanelForStory(story)).toBe("Icebox");
  });

  it("keeps non-current Accepted in Done", () => {
    const story = makeStory({ status: "Accepted" });
    expect(determinePanelForStory(story)).toBe("Done");
  });
});

describe("determinePanelForStory with currentStoryIds (auto-fill)", () => {
  it("returns Current when story is in currentStoryIds", () => {
    const story = makeStory({ id: "s1" });
    expect(
      determinePanelForStory(story, {
        currentStoryIds: new Set(["s1"]),
      }),
    ).toBe("Current");
  });

  it("returns Backlog when story is not in currentStoryIds", () => {
    const story = makeStory({ id: "s2" });
    expect(
      determinePanelForStory(story, {
        currentStoryIds: new Set(["s1"]),
      }),
    ).toBe("Backlog");
  });

  it("Accepted still takes priority over currentStoryIds outside current iteration", () => {
    const story = makeStory({ id: "s1", status: "Accepted" });
    expect(
      determinePanelForStory(story, {
        currentStoryIds: new Set(["s1"]),
      }),
    ).toBe("Done");
  });

  it("in-progress takes priority over currentStoryIds", () => {
    const story = makeStory({ id: "s2", status: "Started" });
    expect(
      determinePanelForStory(story, {
        currentStoryIds: new Set(["s1"]),
      }),
    ).toBe("Current");
  });

  it("falls back to iterationId when not in currentStoryIds", () => {
    const story = makeStory({ id: "s2", iterationId: "iter-1" });
    expect(
      determinePanelForStory(story, {
        currentIterationId: "iter-1",
        currentStoryIds: new Set(["s1"]),
      }),
    ).toBe("Current");
  });
});

describe("resolveDropTargetPanel", () => {
  const stories = [
    makeStory({ id: "backlog-story" }),
    makeStory({ id: "icebox-story", isIcebox: true }),
    makeStory({ id: "current-story", iterationId: "iter-1" }),
  ];

  it("resolves drop-zone-group per-sprint header to panel", () => {
    expect(
      resolveDropTargetPanel("drop-zone-group:Current:iter-1", stories),
    ).toBe("Current");
    expect(
      resolveDropTargetPanel(
        `drop-zone-group:Backlog:${encodeURIComponent("k")}`,
        stories,
      ),
    ).toBe("Backlog");
  });

  it("returns null for drop-zone-group with non-panel prefix", () => {
    expect(
      resolveDropTargetPanel(
        "drop-zone-group:CurrentBacklogCombined:x",
        stories,
      ),
    ).toBeNull();
  });

  it("resolves drop-zone-Backlog to Backlog", () => {
    expect(resolveDropTargetPanel("drop-zone-Backlog", stories)).toBe(
      "Backlog",
    );
  });

  it("resolves drop-zone-Icebox to Icebox", () => {
    expect(resolveDropTargetPanel("drop-zone-Icebox", stories)).toBe("Icebox");
  });

  it("resolves drop-zone-Current to Current", () => {
    expect(resolveDropTargetPanel("drop-zone-Current", stories)).toBe(
      "Current",
    );
  });

  it("resolves drop-zone-Done to Done", () => {
    expect(resolveDropTargetPanel("drop-zone-Done", stories)).toBe("Done");
  });

  it("returns null for invalid drop zone", () => {
    expect(resolveDropTargetPanel("drop-zone-Invalid", stories)).toBeNull();
  });

  it("resolves story ID to its panel", () => {
    expect(
      resolveDropTargetPanel("icebox-story", stories, {
        currentIterationId: "iter-1",
      }),
    ).toBe("Icebox");
  });

  it("resolves current iteration story ID to Current", () => {
    expect(
      resolveDropTargetPanel("current-story", stories, {
        currentIterationId: "iter-1",
      }),
    ).toBe("Current");
  });

  it("returns null for unknown ID", () => {
    expect(resolveDropTargetPanel("unknown-id", stories)).toBeNull();
  });
});

describe("groupStoriesByIteration", () => {
  const iterations = [
    makeIteration("iter-old", "2026-01-01"),
    makeIteration("iter-new", "2026-02-01"),
  ];

  it("sorts Done groups by older iteration first (newer at bottom)", () => {
    const result = groupStoriesByIteration(
      [
        makeStory({ id: "s1", iterationId: "iter-old" }),
        makeStory({ id: "s2", iterationId: "iter-new" }),
      ],
      iterations,
    );
    expect(result.map((group) => group.iterationId)).toEqual([
      "iter-old",
      "iter-new",
    ]);
  });

  it("sorts Backlog groups by older iteration first and keeps unassigned last", () => {
    const result = groupStoriesByIteration(
      [
        makeStory({ id: "s1", iterationId: null, storyPoint: 5 }),
        makeStory({ id: "s2", iterationId: "iter-new", storyPoint: 3 }),
        makeStory({ id: "s3", iterationId: "iter-old", storyPoint: 2 }),
      ],
      iterations,
    );
    expect(result.map((group) => group.iterationId)).toEqual([
      "iter-old",
      "iter-new",
      null,
    ]);
    expect(result.map((group) => group.totalPoints)).toEqual([2, 3, 5]);
  });

  it("allocates iterationId=null stories into future iteration buckets", () => {
    const result = groupStoriesByIteration(
      [
        makeStory({ id: "s1", iterationId: null, storyPoint: 5, position: 1 }),
        makeStory({ id: "s2", iterationId: null, storyPoint: 5, position: 2 }),
        makeStory({ id: "s3", iterationId: null, storyPoint: 2, position: 3 }),
      ],
      iterations,
      {
        panelType: "Backlog",
        velocity: 10,
        sprintDurationDays: 14,
        currentIterationEndDate: "2026-01-20",
      },
    );

    expect(result.map((group) => group.label)).toEqual([
      "開始: 2026-01-21",
      "開始: 2026-02-04",
    ]);
    expect(result.map((group) => group.totalPoints)).toEqual([10, 2]);
  });

  it("uses remaining current capacity for first future backlog bucket", () => {
    const result = groupStoriesByIteration(
      [
        makeStory({ id: "s1", iterationId: null, storyPoint: 2, position: 1 }),
        makeStory({ id: "s2", iterationId: null, storyPoint: 3, position: 2 }),
        makeStory({ id: "s3", iterationId: null, storyPoint: 5, position: 3 }),
      ],
      iterations,
      {
        panelType: "Backlog",
        velocity: 10,
        currentTotalPoints: 5,
        sprintDurationDays: 14,
        currentIterationEndDate: "2026-01-20",
      },
    );

    expect(result.map((group) => group.totalPoints)).toEqual([5, 5]);
  });

  it("allocates zero-point release stories to the next sprint when the first bucket is full", () => {
    const result = groupStoriesByIteration(
      [
        makeStory({ id: "s1", iterationId: null, storyPoint: 5, position: 1 }),
        makeStory({
          id: "release-1",
          type: "release",
          iterationId: null,
          storyPoint: null,
          position: 2,
        }),
      ],
      iterations,
      {
        panelType: "Backlog",
        velocity: 5,
        sprintDurationDays: 14,
        currentIterationEndDate: "2026-01-20",
      },
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.stories.map((story) => story.id)).toEqual(["s1"]);
    expect(result[1]?.stories.map((story) => story.id)).toEqual(["release-1"]);
  });

  it("starts from sprint 2 when first bucket capacity is zero", () => {
    const result = groupStoriesByIteration(
      [
        makeStory({
          id: "release-1",
          type: "release",
          iterationId: null,
          storyPoint: null,
          position: 1,
        }),
        makeStory({
          id: "release-2",
          type: "release",
          iterationId: null,
          storyPoint: null,
          position: 2,
        }),
      ],
      iterations,
      {
        panelType: "Backlog",
        velocity: 10,
        currentTotalPoints: 10,
        sprintDurationDays: 14,
        currentIterationEndDate: "2026-01-20",
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("開始: 2026-02-04");
    expect(result[0]?.stories.map((story) => story.id)).toEqual([
      "release-1",
      "release-2",
    ]);
  });

  it("keeps zero-point release stories in a single bucket when velocity is zero", () => {
    const result = groupStoriesByIteration(
      [
        makeStory({
          id: "release-1",
          type: "release",
          iterationId: null,
          storyPoint: null,
          position: 1,
        }),
        makeStory({ id: "s1", iterationId: null, storyPoint: 2, position: 2 }),
        makeStory({
          id: "release-2",
          type: "release",
          iterationId: null,
          storyPoint: null,
          position: 3,
        }),
      ],
      iterations,
      {
        panelType: "Backlog",
        velocity: 0,
        sprintDurationDays: 14,
        currentIterationEndDate: "2026-01-20",
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.stories.map((story) => story.id)).toEqual([
      "release-1",
      "s1",
      "release-2",
    ]);
    expect(result[0]?.totalPoints).toBe(2);
  });
});
