import { describe, expect, it } from "vitest";
import { planStoryMoveToPanel } from "./story-panel-transition";
import type { Story } from "../types/story";

const baseStory: Story = {
  __typename: "Story",
  id: "story-1",
  storyNumber: 1,
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
};

describe("planStoryMoveToPanel", () => {
  it("plans Current -> Backlog as rollback to Unstarted and unassign iteration", () => {
    const result = planStoryMoveToPanel({
      story: baseStory,
      targetPanel: "Backlog",
      currentIterationId: "iter-current",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.statusPath).toEqual(["Unstarted"]);
    expect(result.targetIterationId).toBeNull();
    expect(result.targetIsIcebox).toBe(false);
  });

  it("plans Delivered -> Backlog through the shortest valid rollback path", () => {
    const result = planStoryMoveToPanel({
      story: { ...baseStory, status: "Delivered" },
      targetPanel: "Backlog",
      currentIterationId: "iter-current",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.statusPath).toEqual(["Accepted", "Unstarted"]);
  });

  it("rejects move to Current when current iteration is missing", () => {
    const result = planStoryMoveToPanel({
      story: { ...baseStory, status: "Unstarted", iterationId: null },
      targetPanel: "Current",
      currentIterationId: null,
    });
    expect(result.ok).toBe(false);
  });

  it("keeps Unstarted when moving Backlog -> Current", () => {
    const result = planStoryMoveToPanel({
      story: { ...baseStory, status: "Unstarted", iterationId: null },
      targetPanel: "Current",
      currentIterationId: "iter-current",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.statusPath).toEqual([]);
    expect(result.targetStatus).toBe("Unstarted");
    expect(result.targetIterationId).toBe("iter-current");
    expect(result.targetIsIcebox).toBe(false);
  });
});
