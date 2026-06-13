import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import type { PanelType } from "./panel-visibility";
import { persistStoryReorder } from "./story-reorder-request";
import type { Story } from "../types/story";

function makeStory(id: string, position: number): Story {
  return {
    __typename: "Story",
    id,
    storyNumber: position,
    projectId: "project-1",
    title: id,
    description: "",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 1,
    labels: [],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

type Harness = {
  sourcePanel: PanelType;
  optimisticReordered: Story[];
  rollbackStories: Story[];
  replacePanelStories: Mock<(panel: PanelType, stories: Story[]) => void>;
  applyExistingStoriesInPanel: Mock<
    (panel: PanelType, stories: Story[]) => void
  >;
  invalidatePanel: Mock<(panel: PanelType) => Promise<void> | void>;
  setError: Mock<(message: string) => void>;
  notifySessionExpired: Mock<() => void>;
  showSuccessToast: Mock<() => void>;
  showErrorToast: Mock<() => void>;
};

function createHarness(): Harness {
  return {
    sourcePanel: "Backlog",
    optimisticReordered: [makeStory("b", 1), makeStory("a", 2)],
    rollbackStories: [makeStory("a", 1), makeStory("b", 2)],
    replacePanelStories: vi.fn<(panel: PanelType, stories: Story[]) => void>(),
    applyExistingStoriesInPanel:
      vi.fn<(panel: PanelType, stories: Story[]) => void>(),
    invalidatePanel: vi.fn<(panel: PanelType) => Promise<void> | void>(),
    setError: vi.fn<(message: string) => void>(),
    notifySessionExpired: vi.fn<() => void>(),
    showSuccessToast: vi.fn<() => void>(),
    showErrorToast: vi.fn<() => void>(),
  };
}

describe("persistStoryReorder", () => {
  it("applies server stories and shows success toast for latest success", async () => {
    const h = createHarness();
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          stories: [makeStory("b", 1), makeStory("a", 2)],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await persistStoryReorder({
      projectId: "project-1",
      ...h,
      isLatestRequest: () => true,
      fetchImpl,
    });

    expect(h.applyExistingStoriesInPanel).toHaveBeenCalledWith("Backlog", [
      expect.objectContaining({ id: "b" }),
      expect.objectContaining({ id: "a" }),
    ]);
    expect(h.showSuccessToast).toHaveBeenCalledTimes(1);
    expect(h.invalidatePanel).toHaveBeenCalledWith("Backlog");
    expect(h.replacePanelStories).not.toHaveBeenCalled();
    expect(h.showErrorToast).not.toHaveBeenCalled();
  });

  it("ignores stale success response", async () => {
    const h = createHarness();
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          stories: [makeStory("b", 1), makeStory("a", 2)],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await persistStoryReorder({
      projectId: "project-1",
      ...h,
      isLatestRequest: () => false,
      fetchImpl,
    });

    expect(h.applyExistingStoriesInPanel).not.toHaveBeenCalled();
    expect(h.showSuccessToast).not.toHaveBeenCalled();
    expect(h.invalidatePanel).not.toHaveBeenCalled();
    expect(h.replacePanelStories).not.toHaveBeenCalled();
    expect(h.showErrorToast).not.toHaveBeenCalled();
  });

  it("ignores stale failure response", async () => {
    const h = createHarness();
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    });

    await persistStoryReorder({
      projectId: "project-1",
      ...h,
      isLatestRequest: () => false,
      fetchImpl,
    });

    expect(h.replacePanelStories).not.toHaveBeenCalled();
    expect(h.setError).not.toHaveBeenCalled();
    expect(h.showErrorToast).not.toHaveBeenCalled();
    expect(h.showSuccessToast).not.toHaveBeenCalled();
  });

  it("rolls back and sets error for latest non-auth failure", async () => {
    const h = createHarness();
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "reorder failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    });

    await persistStoryReorder({
      projectId: "project-1",
      ...h,
      isLatestRequest: () => true,
      fetchImpl,
    });

    expect(h.replacePanelStories).toHaveBeenCalledWith(
      "Backlog",
      h.rollbackStories,
    );
    expect(h.setError).toHaveBeenCalledWith("reorder failed");
    expect(h.showErrorToast).not.toHaveBeenCalled();
    expect(h.showSuccessToast).not.toHaveBeenCalled();
  });

  it("notifies auth expiration for latest auth failure", async () => {
    const h = createHarness();
    const fetchImpl = vi.fn(async () => {
      return new Response("", { status: 401 });
    });

    await persistStoryReorder({
      projectId: "project-1",
      ...h,
      isLatestRequest: () => true,
      fetchImpl,
    });

    expect(h.notifySessionExpired).toHaveBeenCalledTimes(1);
    expect(h.replacePanelStories).not.toHaveBeenCalled();
    expect(h.setError).not.toHaveBeenCalled();
  });

  it("rolls back and shows error toast for latest network error", async () => {
    const h = createHarness();
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    });

    await persistStoryReorder({
      projectId: "project-1",
      ...h,
      isLatestRequest: () => true,
      fetchImpl,
    });

    expect(h.replacePanelStories).toHaveBeenCalledWith(
      "Backlog",
      h.rollbackStories,
    );
    expect(h.showErrorToast).toHaveBeenCalledTimes(1);
    expect(h.showSuccessToast).not.toHaveBeenCalled();
  });
});
