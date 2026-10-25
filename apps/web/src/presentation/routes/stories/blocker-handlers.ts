import type { Context } from "hono";
import {
  addStoryBlocker,
  STORY_BLOCKER_CYCLE_ERROR,
  STORY_BLOCKER_STORY_NOT_FOUND_ERROR,
  STORY_BLOCKS_ITSELF_ERROR,
} from "../../../application/usecases/add-story-blocker";
import { removeStoryBlocker } from "../../../application/usecases/remove-story-blocker";
import type { Story } from "../../../domain/entities/story";
import { D1StoryRepository } from "../../../infrastructure/db/repositories/d1-story-repository";
import type { Env } from "../../../index";
import { parseStoryNumberReference } from "../../lib/story-number-reference";
import { parseStoryBlockerRequest } from "./request-parsers";

export type StoryBlockerChange =
  | { ok: true; story: Story; relatedStory: Story; changed: boolean }
  | { ok: false; response: Response };

async function resolveStoryByReference(
  repository: D1StoryRepository,
  projectId: string,
  storyRef: string,
) {
  const storyNumber = parseStoryNumberReference(storyRef);
  if (storyNumber !== null) {
    return repository.findByStoryNumber(projectId, storyNumber);
  }

  return repository.findById(projectId, storyRef);
}

/**
 * Shared by the session, CLI and API key routes so that every client enforces
 * the same blocker rules. `changed` is false when the request was a no-op.
 */
export async function changeStoryBlocker(
  c: Context<Env>,
  input: { projectId: string; action: "add" | "remove" },
): Promise<StoryBlockerChange> {
  const { projectId } = input;
  const fail = (body: { error: string }, status: 400 | 404 | 409 | 500) => {
    return { ok: false, response: c.json(body, status) } as const;
  };

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseStoryBlockerRequest(body);
  if (!parsed.ok) {
    return fail({ error: parsed.message }, 400);
  }

  const repository = new D1StoryRepository(c.env.DB);
  const storyNumber = parseStoryNumberReference(
    c.req.param("storyNumber") ?? "",
  );
  if (storyNumber === null) {
    return fail({ error: "Story not found" }, 404);
  }
  const storyResult = await repository.findByStoryNumber(
    projectId,
    storyNumber,
  );
  if (storyResult.isErr()) {
    return fail({ error: "Failed to resolve story" }, 500);
  }
  if (!storyResult.value) {
    return fail({ error: "Story not found" }, 404);
  }
  const story = storyResult.value;

  const targetStoryResult = await resolveStoryByReference(
    repository,
    projectId,
    parsed.value.targetStoryId,
  );
  if (targetStoryResult.isErr()) {
    return fail({ error: "Failed to resolve story" }, 500);
  }
  if (!targetStoryResult.value) {
    return fail({ error: "Story not found" }, 404);
  }
  const target = targetStoryResult.value;

  const [blocking, blocked] =
    parsed.value.relation === "blockedBy" ? [target, story] : [story, target];
  const change = {
    projectId,
    blockingStoryId: blocking.id,
    blockedStoryId: blocked.id,
  };
  const result =
    input.action === "add"
      ? await addStoryBlocker(repository, change)
      : await removeStoryBlocker(repository, change);
  if (result.isErr()) {
    switch (result.error) {
      case STORY_BLOCKS_ITSELF_ERROR:
        return fail({ error: "A story cannot block itself" }, 400);
      case STORY_BLOCKER_STORY_NOT_FOUND_ERROR:
        return fail({ error: "Story not found" }, 404);
      case STORY_BLOCKER_CYCLE_ERROR:
        return fail(
          {
            error: `Cannot make #${blocking.storyNumber} block #${blocked.storyNumber}: #${blocked.storyNumber} already blocks #${blocking.storyNumber} (directly or through other stories)`,
          },
          409,
        );
      default:
        return fail({ error: "Failed to update story blockers" }, 500);
    }
  }

  const [updatedStoryResult, relatedStoryResult] = await Promise.all([
    repository.findById(projectId, story.id),
    repository.findById(projectId, target.id),
  ]);
  if (
    updatedStoryResult.isErr() ||
    !updatedStoryResult.value ||
    relatedStoryResult.isErr() ||
    !relatedStoryResult.value
  ) {
    return fail({ error: "Failed to load updated story" }, 500);
  }

  return {
    ok: true,
    story: updatedStoryResult.value,
    relatedStory: relatedStoryResult.value,
    changed: result.value,
  };
}
