import { describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import type { Story } from "../../../src/domain/entities/story";
import {
  ITERATION_STORY_STATUS_CONFLICT_ERROR,
  type IterationRepository,
} from "../../../src/domain/repositories/iteration-repository";
import type { StoryRepository } from "../../../src/domain/repositories/story-repository";
import {
  STORY_ITERATION_UNASSIGN_INVALID_STATUS_ERROR,
  unassignStoryIterationByNumber,
} from "../../../src/application/usecases/unassign-story-iteration";

const story = {
  id: "s1",
  status: "Unstarted",
  iterationId: "it1",
  archivedAt: null,
} as unknown as Story;

describe("unassignStoryIterationByNumber", () => {
  it("reports a conflict when the story leaves Unstarted before the conditional update", async () => {
    const storyRepository = {
      findByStoryNumber: vi.fn(async () => ok(story)),
      findById: vi.fn(),
    } as unknown as StoryRepository;
    const unassignStory = vi.fn(async () =>
      err(ITERATION_STORY_STATUS_CONFLICT_ERROR),
    );
    const iterationRepository = {
      unassignStory,
    } as unknown as IterationRepository;

    const result = await unassignStoryIterationByNumber(
      storyRepository,
      iterationRepository,
      { projectId: "p1", storyNumber: 1 },
    );

    expect(unassignStory).toHaveBeenCalledWith({
      projectId: "p1",
      storyId: "s1",
      requiredStatus: "Unstarted",
    });
    expect(result._unsafeUnwrapErr()).toBe(
      STORY_ITERATION_UNASSIGN_INVALID_STATUS_ERROR,
    );
  });
});
