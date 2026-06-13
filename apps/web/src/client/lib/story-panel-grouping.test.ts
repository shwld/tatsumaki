import { describe, expect, it } from "vitest";

import type { Iteration } from "../types/iteration";
import type { Story } from "../types/story";
import {
  calculateTotalPoints,
  groupStoriesByPanel,
  groupStoriesByIteration,
} from "./story-panel-grouping";

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    __typename: "Story",
    id: "story-1",
    projectId: "project-1",
    title: "Test story",
    description: "",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: null,
    labels: [],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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
    projectId: "project-1",
    startDate,
    endDate,
    totalPoints: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("groupStoriesByPanel", () => {
  it("keeps Accepted stories in current iteration inside Current panel", () => {
    const stories = [
      makeStory({ id: "s1", status: "Accepted" }),
      makeStory({ id: "s2", status: "Accepted", isIcebox: true }),
      makeStory({
        id: "s3",
        status: "Accepted",
        iterationId: "iter-1",
      }),
    ];
    const result = groupStoriesByPanel(stories, {
      currentIterationId: "iter-1",
    });
    expect(result.Done).toHaveLength(2);
    expect(result.Current).toHaveLength(1);
  });

  it("groups stories with matching iterationId into Current panel", () => {
    const stories = [
      makeStory({ id: "s1", status: "Unstarted", iterationId: "iter-1" }),
    ];
    const result = groupStoriesByPanel(stories, {
      currentIterationId: "iter-1",
    });
    expect(result.Current).toHaveLength(1);
  });

  it("groups in-progress stories into Current panel", () => {
    const stories = [
      makeStory({ id: "s1", status: "Started" }),
      makeStory({ id: "s2", status: "Finished" }),
      makeStory({ id: "s3", status: "Delivered" }),
    ];
    const result = groupStoriesByPanel(stories);
    expect(result.Current).toHaveLength(3);
  });

  it("groups stories with non-matching iterationId into Backlog", () => {
    const stories = [
      makeStory({ id: "s1", status: "Unstarted", iterationId: "iter-2" }),
    ];
    const result = groupStoriesByPanel(stories, {
      currentIterationId: "iter-1",
    });
    expect(result.Backlog).toHaveLength(1);
  });

  it("groups isIcebox stories into Icebox panel", () => {
    const stories = [
      makeStory({ id: "s1", status: "Unstarted", isIcebox: true }),
    ];
    const result = groupStoriesByPanel(stories);
    expect(result.Icebox).toHaveLength(1);
  });

  it("groups non-icebox Unstarted stories without iteration into Backlog", () => {
    const stories = [
      makeStory({ id: "s1", status: "Unstarted" }),
      makeStory({ id: "s2", status: "Rejected" }),
    ];
    const result = groupStoriesByPanel(stories);
    expect(result.Backlog).toHaveLength(2);
  });

  it("iteration assignment takes priority over isIcebox for non-Accepted stories", () => {
    const stories = [
      makeStory({
        id: "s1",
        status: "Unstarted",
        iterationId: "iter-1",
        isIcebox: true,
      }),
    ];
    const result = groupStoriesByPanel(stories, {
      currentIterationId: "iter-1",
    });
    expect(result.Current).toHaveLength(1);
    expect(result.Icebox).toHaveLength(0);
  });

  it("without currentIterationId, iteration-assigned stories go to Backlog", () => {
    const stories = [
      makeStory({ id: "s1", status: "Unstarted", iterationId: "iter-1" }),
    ];
    const result = groupStoriesByPanel(stories);
    expect(result.Backlog).toHaveLength(1);
    expect(result.Current).toHaveLength(0);
  });

  it("correctly distributes stories across all panels", () => {
    const stories = [
      makeStory({ id: "s1", status: "Accepted" }),
      makeStory({ id: "s2", status: "Started" }),
      makeStory({ id: "s3", status: "Unstarted" }),
      makeStory({ id: "s4", status: "Unstarted", isIcebox: true }),
    ];
    const result = groupStoriesByPanel(stories);
    expect(result.Done).toHaveLength(1);
    expect(result.Current).toHaveLength(1);
    expect(result.Backlog).toHaveLength(1);
    expect(result.Icebox).toHaveLength(1);
  });
});

describe("calculateTotalPoints", () => {
  it("sums story points, treating null as 0", () => {
    const stories = [
      makeStory({ storyPoint: 3 }),
      makeStory({ storyPoint: null }),
      makeStory({ storyPoint: 5 }),
    ];
    expect(calculateTotalPoints(stories)).toBe(8);
  });

  it("returns 0 for empty list", () => {
    expect(calculateTotalPoints([])).toBe(0);
  });
});

describe("groupStoriesByIteration", () => {
  const iterations = [
    makeIteration("iter-old", "2026-01-01"),
    makeIteration("iter-new", "2026-02-01"),
  ];

  it("sorts Done groups by older iteration first (newer at bottom)", () => {
    const stories = [
      makeStory({ id: "s1", iterationId: "iter-old" }),
      makeStory({ id: "s2", iterationId: "iter-new" }),
    ];
    const result = groupStoriesByIteration(stories, iterations);
    expect(result.map((group) => group.iterationId)).toEqual([
      "iter-old",
      "iter-new",
    ]);
  });

  it("sorts Backlog groups by older iteration first and keeps unassigned last", () => {
    const stories = [
      makeStory({ id: "s1", iterationId: null, storyPoint: 5 }),
      makeStory({ id: "s2", iterationId: "iter-new", storyPoint: 3 }),
      makeStory({ id: "s3", iterationId: "iter-old", storyPoint: 2 }),
    ];
    const result = groupStoriesByIteration(stories, iterations);

    expect(result.map((group) => group.iterationId)).toEqual([
      "iter-old",
      "iter-new",
      null,
    ]);
    expect(result[0]?.totalPoints).toBe(2);
    expect(result[1]?.totalPoints).toBe(3);
    expect(result[2]?.totalPoints).toBe(5);
  });

  it("allocates iterationId=null stories into future iterations for Backlog", () => {
    const stories = [
      makeStory({ id: "iter-story", iterationId: "iter-old", storyPoint: 2 }),
      makeStory({ id: "s-5-a", iterationId: null, storyPoint: 5, position: 1 }),
      makeStory({ id: "s-5-b", iterationId: null, storyPoint: 5, position: 2 }),
      makeStory({ id: "s-2", iterationId: null, storyPoint: 2, position: 3 }),
    ];

    const result = groupStoriesByIteration(stories, iterations, {
      panelType: "Backlog",
      velocity: 10,
      sprintDurationDays: 14,
      currentIterationEndDate: "2026-01-20",
    });

    expect(result.map((group) => group.label)).toEqual([
      "開始: 2026-01-01",
      "開始: 2026-01-21",
      "開始: 2026-02-04",
    ]);
    expect(result.map((group) => group.totalPoints)).toEqual([2, 10, 2]);
  });

  it("treats null story points as 0 and preserves position-order allocation", () => {
    const stories = [
      makeStory({ id: "s-5", iterationId: null, storyPoint: 5, position: 2 }),
      makeStory({
        id: "s-null",
        iterationId: null,
        storyPoint: null,
        position: 1,
      }),
      makeStory({ id: "s-6", iterationId: null, storyPoint: 6, position: 3 }),
    ];
    const result = groupStoriesByIteration(stories, [], {
      panelType: "Backlog",
      velocity: 10,
      sprintDurationDays: 14,
      iterationStartDay: 1,
      todayIso: "2026-01-15",
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.stories.map((story) => story.id)).toEqual([
      "s-null",
      "s-5",
    ]);
    expect(result[0]?.totalPoints).toBe(5);
    expect(result[1]?.stories.map((story) => story.id)).toEqual(["s-6"]);
    expect(result[1]?.totalPoints).toBe(6);
  });

  it("uses remaining current capacity for the first Backlog future iteration", () => {
    const stories = [
      makeStory({ id: "s-2", iterationId: null, storyPoint: 2, position: 1 }),
      makeStory({ id: "s-3", iterationId: null, storyPoint: 3, position: 2 }),
      makeStory({ id: "s-5", iterationId: null, storyPoint: 5, position: 3 }),
    ];

    const result = groupStoriesByIteration(stories, iterations, {
      panelType: "Backlog",
      velocity: 13,
      currentTotalPoints: 8,
      sprintDurationDays: 14,
      currentIterationEndDate: "2026-01-20",
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.label).toBe("開始: 2026-01-21");
    expect(result[0]?.totalPoints).toBe(5);
    expect(result[1]?.label).toBe("開始: 2026-02-04");
    expect(result[1]?.totalPoints).toBe(5);
  });

  it("allocates zero-point release stories to the next sprint when first bucket is full", () => {
    const stories = [
      makeStory({ id: "s-5", iterationId: null, storyPoint: 5, position: 1 }),
      makeStory({
        id: "release-1",
        type: "release",
        iterationId: null,
        storyPoint: null,
        position: 2,
      }),
    ];

    const result = groupStoriesByIteration(stories, iterations, {
      panelType: "Backlog",
      velocity: 5,
      sprintDurationDays: 14,
      currentIterationEndDate: "2026-01-20",
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.stories.map((story) => story.id)).toEqual(["s-5"]);
    expect(result[1]?.stories.map((story) => story.id)).toEqual(["release-1"]);
  });

  it("starts from sprint 2 when first bucket capacity is zero", () => {
    const stories = [
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
    ];

    const result = groupStoriesByIteration(stories, iterations, {
      panelType: "Backlog",
      velocity: 10,
      currentTotalPoints: 10,
      sprintDurationDays: 14,
      currentIterationEndDate: "2026-01-20",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("開始: 2026-02-04");
    expect(result[0]?.stories.map((story) => story.id)).toEqual([
      "release-1",
      "release-2",
    ]);
  });

  it("uses a single future bucket when velocity is zero", () => {
    const stories = [
      makeStory({ id: "s-2", iterationId: null, storyPoint: 2, position: 1 }),
      makeStory({ id: "s-13", iterationId: null, storyPoint: 13, position: 2 }),
    ];
    const result = groupStoriesByIteration(stories, iterations, {
      panelType: "Backlog",
      velocity: 0,
      sprintDurationDays: 14,
      currentIterationEndDate: "2026-01-20",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.stories).toHaveLength(2);
    expect(result[0]?.totalPoints).toBe(15);
  });

  it("keeps zero-point stories in one bucket when velocity is zero", () => {
    const stories = [
      makeStory({
        id: "release-1",
        type: "release",
        iterationId: null,
        storyPoint: null,
        position: 1,
      }),
      makeStory({ id: "s-2", iterationId: null, storyPoint: 2, position: 2 }),
      makeStory({
        id: "release-2",
        type: "release",
        iterationId: null,
        storyPoint: null,
        position: 3,
      }),
    ];

    const result = groupStoriesByIteration(stories, iterations, {
      panelType: "Backlog",
      velocity: 0,
      sprintDurationDays: 14,
      currentIterationEndDate: "2026-01-20",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.stories.map((story) => story.id)).toEqual([
      "release-1",
      "s-2",
      "release-2",
    ]);
    expect(result[0]?.totalPoints).toBe(2);
  });
});
