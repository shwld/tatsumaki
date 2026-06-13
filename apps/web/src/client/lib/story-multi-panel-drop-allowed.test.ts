import { describe, expect, it } from "vitest";
import {
  isStoryMultiPanelDropAllowed,
  panelTypeFromDropZoneGroupId,
} from "./story-multi-panel-drop-allowed";
import type { Story } from "../types/story";
import type { PanelType } from "./panel-visibility";

const mkStory = (overrides: Partial<Story>): Story => ({
  __typename: "Story",
  id: "story-1",
  projectId: "project-1",
  title: "Story",
  description: "desc",
  type: "feature",
  status: "Started",
  statusChangedAt: "2026-01-01T00:00:00.000Z",
  storyPoint: 3,
  labels: [],
  iterationId: "iter-current",
  isIcebox: false,
  ownerIds: [],
  requesterId: null,
  releaseDate: null,
  position: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
  storyNumber: overrides.storyNumber ?? 1,
});

const emptyGrouped = (): Record<PanelType, Story[]> => ({
  Done: [],
  Current: [],
  Backlog: [],
  Icebox: [],
});

describe("panelTypeFromDropZoneGroupId", () => {
  it("parses per-sprint header drop zone ids", () => {
    expect(panelTypeFromDropZoneGroupId("drop-zone-group:Current:iter-1")).toBe(
      "Current",
    );
    expect(
      panelTypeFromDropZoneGroupId(
        `drop-zone-group:Backlog:${encodeURIComponent("foo:bar")}`,
      ),
    ).toBe("Backlog");
  });

  it("returns null for combined or unknown panel prefixes", () => {
    expect(
      panelTypeFromDropZoneGroupId("drop-zone-group:CurrentBacklogCombined:x"),
    ).toBe(null);
    expect(panelTypeFromDropZoneGroupId("drop-zone-Current")).toBe(null);
  });
});

describe("isStoryMultiPanelDropAllowed", () => {
  it("returns false when over is missing or project id is missing", () => {
    const story = mkStory({});
    const grouped = emptyGrouped();
    grouped.Current = [story];
    expect(
      isStoryMultiPanelDropAllowed({
        projectId: "p1",
        activeStoryId: story.id,
        overId: null,
        findPanelByStoryId: () => "Current",
        shouldCombineCurrentBacklog: false,
        combinedGroupDropZonePrefix: "drop-zone-group:CurrentBacklogCombined:",
        combinedTargetPanelByGroupKey: new Map(),
        allStories: [story],
        currentIterationId: "iter-current",
        groupedStories: grouped,
        currentUnacceptedStories: grouped.Current,
      }),
    ).toBe(false);

    expect(
      isStoryMultiPanelDropAllowed({
        projectId: undefined,
        activeStoryId: story.id,
        overId: story.id,
        findPanelByStoryId: () => "Current",
        shouldCombineCurrentBacklog: false,
        combinedGroupDropZonePrefix: "drop-zone-group:CurrentBacklogCombined:",
        combinedTargetPanelByGroupKey: new Map(),
        allStories: [story],
        currentIterationId: "iter-current",
        groupedStories: grouped,
        currentUnacceptedStories: grouped.Current,
      }),
    ).toBe(false);
  });

  it("rejects cross-panel drop onto Done panel shell", () => {
    const story = mkStory({});
    const grouped = emptyGrouped();
    grouped.Current = [story];
    expect(
      isStoryMultiPanelDropAllowed({
        projectId: "p1",
        activeStoryId: story.id,
        overId: "drop-zone-Done",
        findPanelByStoryId: (id) => (id === story.id ? "Current" : null),
        shouldCombineCurrentBacklog: false,
        combinedGroupDropZonePrefix: "drop-zone-group:CurrentBacklogCombined:",
        combinedTargetPanelByGroupKey: new Map(),
        allStories: [story],
        currentIterationId: "iter-current",
        groupedStories: grouped,
        currentUnacceptedStories: grouped.Current,
      }),
    ).toBe(false);
  });

  it("allows cross-panel drop onto Current sprint group header when Current has only Accepted stories", () => {
    const backlogStory = mkStory({
      id: "backlog-1",
      status: "Unstarted",
      iterationId: null,
    });
    const accepted = mkStory({
      id: "accepted-1",
      status: "Accepted",
      storyNumber: 2,
      iterationId: "iter-current",
    });
    const grouped = emptyGrouped();
    grouped.Backlog = [backlogStory];
    grouped.Current = [accepted];
    expect(
      isStoryMultiPanelDropAllowed({
        projectId: "p1",
        activeStoryId: backlogStory.id,
        overId: "drop-zone-group:Current:iter-current",
        findPanelByStoryId: (id) => {
          if (id === backlogStory.id) return "Backlog";
          if (id === accepted.id) return "Current";
          return null;
        },
        shouldCombineCurrentBacklog: false,
        combinedGroupDropZonePrefix: "drop-zone-group:CurrentBacklogCombined:",
        combinedTargetPanelByGroupKey: new Map(),
        allStories: [backlogStory, accepted],
        currentIterationId: "iter-current",
        groupedStories: grouped,
        currentUnacceptedStories: [],
      }),
    ).toBe(true);
  });

  it("allows combined-mode Backlog shell when it resolves to same logical panel (reorder)", () => {
    const story = mkStory({});
    const grouped = emptyGrouped();
    grouped.Current = [story];
    expect(
      isStoryMultiPanelDropAllowed({
        projectId: "p1",
        activeStoryId: story.id,
        overId: "drop-zone-Backlog",
        findPanelByStoryId: (id) => (id === story.id ? "Current" : null),
        shouldCombineCurrentBacklog: true,
        combinedGroupDropZonePrefix: "drop-zone-group:CurrentBacklogCombined:",
        combinedTargetPanelByGroupKey: new Map(),
        allStories: [story],
        currentIterationId: "iter-current",
        groupedStories: grouped,
        currentUnacceptedStories: grouped.Current,
      }),
    ).toBe(true);
  });
});
