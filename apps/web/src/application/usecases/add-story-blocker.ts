import { err, ok, type Result } from "neverthrow";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";

export async function addStoryBlocker(
  repository: StoryRepository,
  input: {
    blockingStoryId: string;
    blockedStoryId: string;
  },
): Promise<Result<true, StoryRepositoryError>> {
  const result = await repository.addBlocker(
    input.blockingStoryId,
    input.blockedStoryId,
  );

  if (result.isErr()) {
    return err(result.error);
  }

  return ok(true);
}
