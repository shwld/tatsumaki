import { err, type Result } from "neverthrow";
import type {
  StoryBlockerPair,
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";

export const STORY_BLOCKS_ITSELF_ERROR = "STORY_BLOCKS_ITSELF_ERROR" as const;
export const STORY_BLOCKER_CYCLE_ERROR = "STORY_BLOCKER_CYCLE_ERROR" as const;
export const STORY_BLOCKER_STORY_NOT_FOUND_ERROR =
  "STORY_BLOCKER_STORY_NOT_FOUND_ERROR" as const;

export type StoryBlockerError =
  | StoryRepositoryError
  | typeof STORY_BLOCKS_ITSELF_ERROR
  | typeof STORY_BLOCKER_CYCLE_ERROR
  | typeof STORY_BLOCKER_STORY_NOT_FOUND_ERROR;

export type StoryBlockerInput = {
  projectId: string;
  blockingStoryId: string;
  blockedStoryId: string;
};

/** True when the blocked story already blocks the blocking story, directly or through other stories. */
function leadsBackToBlockingStory(
  pairs: StoryBlockerPair[],
  input: Pick<StoryBlockerInput, "blockingStoryId" | "blockedStoryId">,
): boolean {
  const blockedIdsByBlockingId = new Map<string, string[]>();
  for (const pair of pairs) {
    blockedIdsByBlockingId.set(pair.blockingStoryId, [
      ...(blockedIdsByBlockingId.get(pair.blockingStoryId) ?? []),
      pair.blockedStoryId,
    ]);
  }

  const visited = new Set<string>();
  const pending = [input.blockedStoryId];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    if (current === input.blockingStoryId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    pending.push(...(blockedIdsByBlockingId.get(current) ?? []));
  }

  return false;
}

/** Resolves to false when the blocker was already registered. */
export async function addStoryBlocker(
  repository: StoryRepository,
  input: StoryBlockerInput,
): Promise<Result<boolean, StoryBlockerError>> {
  if (input.blockingStoryId === input.blockedStoryId) {
    return err(STORY_BLOCKS_ITSELF_ERROR);
  }

  const [blockingStory, blockedStory] = await Promise.all([
    repository.findById(input.projectId, input.blockingStoryId),
    repository.findById(input.projectId, input.blockedStoryId),
  ]);
  if (blockingStory.isErr()) {
    return err(blockingStory.error);
  }
  if (blockedStory.isErr()) {
    return err(blockedStory.error);
  }
  if (!blockingStory.value || !blockedStory.value) {
    return err(STORY_BLOCKER_STORY_NOT_FOUND_ERROR);
  }

  const pairs = await repository.listBlockerPairs(input.projectId);
  if (pairs.isErr()) {
    return err(pairs.error);
  }
  if (leadsBackToBlockingStory(pairs.value, input)) {
    return err(STORY_BLOCKER_CYCLE_ERROR);
  }

  return repository.addBlocker(input.blockingStoryId, input.blockedStoryId);
}
