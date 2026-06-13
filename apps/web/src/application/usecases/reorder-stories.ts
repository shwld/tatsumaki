import { err, ok, type Result } from "neverthrow";
import type { Story } from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";

export const INVALID_STORY_ORDER_ERROR = "INVALID_STORY_ORDER_ERROR" as const;

export type ReorderStoriesError =
  | typeof INVALID_STORY_ORDER_ERROR
  | StoryRepositoryError;

export async function reorderStories(
  repository: StoryRepository,
  projectId: string,
  orderedIds: string[],
): Promise<Result<Story[], ReorderStoriesError>> {
  if (orderedIds.length === 0) {
    return err(INVALID_STORY_ORDER_ERROR);
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    return err(INVALID_STORY_ORDER_ERROR);
  }

  const result = await repository.reorder({ projectId, orderedIds });

  if (result.isErr()) {
    return err(result.error);
  }

  if (!result.value) {
    return err(INVALID_STORY_ORDER_ERROR);
  }

  return ok(result.value);
}
