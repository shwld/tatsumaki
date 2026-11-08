import { err, ok, type Result } from "neverthrow";
import type { Story } from "../../domain/entities/story";
import type {
  IterationRepository,
  IterationRepositoryError,
} from "../../domain/repositories/iteration-repository";
import {
  STORY_ARCHIVED_ERROR,
  type StoryRepository,
  type StoryRepositoryError,
} from "../../domain/repositories/story-repository";

export const STORY_ITERATION_UNASSIGN_NOT_FOUND_ERROR =
  "STORY_ITERATION_UNASSIGN_NOT_FOUND_ERROR" as const;
export const STORY_ITERATION_UNASSIGN_INVALID_STATUS_ERROR =
  "STORY_ITERATION_UNASSIGN_INVALID_STATUS_ERROR" as const;

export type UnassignStoryIterationError =
  | typeof STORY_ITERATION_UNASSIGN_NOT_FOUND_ERROR
  | typeof STORY_ITERATION_UNASSIGN_INVALID_STATUS_ERROR
  | StoryRepositoryError
  | IterationRepositoryError;

export async function unassignStoryIterationByNumber(
  storyRepository: StoryRepository,
  iterationRepository: IterationRepository,
  input: { projectId: string; storyNumber: number },
): Promise<
  Result<{ story: Story; changed: boolean }, UnassignStoryIterationError>
> {
  const found = await storyRepository.findByStoryNumber(
    input.projectId,
    input.storyNumber,
  );
  if (found.isErr()) {
    return err(found.error);
  }
  const story = found.value;
  if (!story) {
    return err(STORY_ITERATION_UNASSIGN_NOT_FOUND_ERROR);
  }
  if (story.archivedAt !== null) {
    return err(STORY_ARCHIVED_ERROR);
  }
  if (story.status !== "Unstarted") {
    return err(STORY_ITERATION_UNASSIGN_INVALID_STATUS_ERROR);
  }
  if (story.iterationId === null) {
    return ok({ story, changed: false });
  }

  const unassigned = await iterationRepository.unassignStory({
    projectId: input.projectId,
    storyId: story.id,
  });
  if (unassigned.isErr()) {
    return err(unassigned.error);
  }
  if (!unassigned.value) {
    return err(STORY_ITERATION_UNASSIGN_NOT_FOUND_ERROR);
  }

  const reloaded = await storyRepository.findById(input.projectId, story.id);
  if (reloaded.isErr()) {
    return err(reloaded.error);
  }
  if (!reloaded.value) {
    return err(STORY_ITERATION_UNASSIGN_NOT_FOUND_ERROR);
  }
  return ok({ story: reloaded.value, changed: true });
}
