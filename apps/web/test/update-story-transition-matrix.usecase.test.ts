import { ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import { updateStory } from "../src/application/usecases/update-story";
import {
  STORY_STATUSES,
  type Story,
  type StoryStatus,
} from "../src/domain/entities/story";

const ALLOWED_NEXT: Record<StoryStatus, StoryStatus[]> = {
  Unstarted: ["Started"],
  Started: ["Unstarted", "Finished"],
  Finished: ["Started", "Delivered"],
  Delivered: ["Finished", "Accepted", "Rejected"],
  Accepted: ["Unstarted", "Started"],
  Rejected: ["Started"],
};

function buildStory(overrides: Partial<Story>): Story {
  return {
    __typename: "Story",
    id: "story-1",
    storyNumber: 1,
    projectId: "project-1",
    title: "Story",
    description: "",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: "2026-03-27T00:00:00.000Z",
    completedAt: null,
    storyPoint: 3,
    labels: [],
    epicId: null,
    iterationId: "iter-1",
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 1,
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
    ...overrides,
  } as Story;
}

const cases = STORY_STATUSES.flatMap((from) =>
  STORY_STATUSES.map((to) => ({
    from,
    to,
    permitted: from === to || ALLOWED_NEXT[from].includes(to),
  })),
);

describe("updateStory status transition matrix", () => {
  it.each(cases)("$from -> $to is permitted: $permitted", async ({
    from,
    to,
    permitted,
  }) => {
    const repository = {
      findById: vi.fn().mockResolvedValue(ok(buildStory({ status: from }))),
      update: vi.fn().mockResolvedValue(ok(buildStory({ status: to }))),
    };
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    };

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: to,
        actor: { id: "github|member-1", name: "member@example.com" },
      },
    );

    if (permitted) {
      expect(result.isOk()).toBe(true);
      return;
    }
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "INVALID_STORY_STATUS_TRANSITION_ERROR",
      from,
      to,
      allowedNext: ALLOWED_NEXT[from],
    });
    expect(repository.update).not.toHaveBeenCalled();
  });
});
