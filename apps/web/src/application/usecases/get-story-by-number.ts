import { err, ok, type Result } from "neverthrow";
import { getStory } from "./get-story";
import type { Story } from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";

export const STORY_NOT_FOUND_ERROR = "STORY_NOT_FOUND_ERROR" as const;

export async function getStoryByNumber(
  repository: StoryRepository,
  input: { projectId: string; storyNumber: number },
): Promise<Result<Story, StoryRepositoryError | typeof STORY_NOT_FOUND_ERROR>> {
  const storyByNumber = await repository.findByStoryNumber(
    input.projectId,
    input.storyNumber,
  );
  if (storyByNumber.isErr()) {
    return err(storyByNumber.error);
  }
  if (!storyByNumber.value) {
    return err(STORY_NOT_FOUND_ERROR);
  }

  const storyResult = await getStory(repository, {
    projectId: input.projectId,
    storyId: storyByNumber.value.id,
  });
  if (storyResult.isErr()) {
    return err(storyResult.error);
  }
  if (!storyResult.value) {
    return err(STORY_NOT_FOUND_ERROR);
  }

  return ok(storyResult.value);
}
