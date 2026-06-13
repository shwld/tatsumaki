import type { Result } from "neverthrow";
import type { StoryPriorityHistory } from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";

export async function listStoryPriorityHistory(
  repository: StoryRepository,
  projectId: string,
): Promise<Result<StoryPriorityHistory[], StoryRepositoryError>> {
  return repository.listPriorityHistory(projectId);
}
