import type { Result } from "neverthrow";
import type { Story } from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";

export async function getStory(
  repository: StoryRepository,
  input: {
    projectId: string;
    storyId: string;
  },
): Promise<Result<Story | null, StoryRepositoryError>> {
  return repository.findById(input.projectId, input.storyId);
}
