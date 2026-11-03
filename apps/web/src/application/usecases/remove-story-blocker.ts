import { err, type Result } from "neverthrow";
import type { StoryRepository } from "../../domain/repositories/story-repository";
import { STORY_ARCHIVED_ERROR } from "../../domain/repositories/story-repository";
import {
  STORY_BLOCKS_ITSELF_ERROR,
  type StoryBlockerError,
  type StoryBlockerInput,
} from "./add-story-blocker";

/** Resolves to false when there was no such blocker to remove. */
export async function removeStoryBlocker(
  repository: StoryRepository,
  input: StoryBlockerInput,
): Promise<Result<boolean, StoryBlockerError>> {
  if (input.blockingStoryId === input.blockedStoryId) {
    return err(STORY_BLOCKS_ITSELF_ERROR);
  }

  const [blocking, blocked] = await Promise.all([
    repository.findById(input.projectId, input.blockingStoryId),
    repository.findById(input.projectId, input.blockedStoryId),
  ]);
  if (blocking.isErr()) return err(blocking.error);
  if (blocked.isErr()) return err(blocked.error);
  if (blocking.value?.archivedAt || blocked.value?.archivedAt)
    return err(STORY_ARCHIVED_ERROR);

  return repository.removeBlocker(input.blockingStoryId, input.blockedStoryId);
}
