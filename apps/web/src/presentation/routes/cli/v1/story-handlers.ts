import type { Context } from "hono";
import type { ProjectMember } from "../../../../domain/entities/project-member";
import { getPointScale } from "../../../../domain/entities/project";
import { D1NotificationRepository } from "../../../../infrastructure/db/repositories/d1-notification-repository";
import { D1ProjectRepository } from "../../../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryActivityRepository } from "../../../../infrastructure/db/repositories/d1-story-activity-repository";
import { D1StoryRepository } from "../../../../infrastructure/db/repositories/d1-story-repository";
import type { Env } from "../../../../index";
import {
  moveStoryToPosition,
  parseStoryPlacement,
  resolveStoryPlacementAnchor,
  type StoryPlacement,
} from "../../../../application/usecases/move-story-to-position";
import {
  NO_STORY_FIELDS_TO_UPDATE_ERROR,
  updateStory,
} from "../../../../application/usecases/update-story";
import {
  toMoveStoryErrorResponse,
  toUpdateStoryErrorResponse,
} from "../../stories/error-responses";
import { parseUpdateStoryRequest } from "../../stories/request-parsers";
import { parseStoryNumberReference } from "../../../lib/story-number-reference";

export async function resolveStoryIdByNumber(
  repository: D1StoryRepository,
  projectId: string,
  storyNumberRef: string,
) {
  const storyNumber = parseStoryNumberReference(storyNumberRef);
  if (storyNumber === null) {
    return null;
  }
  const found = await repository.findByStoryNumber(projectId, storyNumber);
  if (found.isErr() || !found.value) {
    return null;
  }
  return found.value.id;
}

export async function parseJsonBody(c: Context<Env>) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

/**
 * Shared PATCH handler for story update.
 * Caller provides actorId and actorName to allow different auth contexts
 * (OAuth user vs. API key) to record the correct actor in activity logs.
 */
export async function handleCliStoryUpdate(
  c: Context<Env>,
  member: ProjectMember,
  actorId: string,
  actorName: string,
): Promise<Response> {
  const projectId = c.req.param("projectId") ?? "";
  const storyNumberRef = c.req.param("storyNumber") ?? "";

  const storyRepository = new D1StoryRepository(c.env.DB);
  const projectRepository = new D1ProjectRepository(c.env.DB);
  const projectResult = await projectRepository.findById(projectId);
  if (projectResult.isErr()) {
    return c.json({ error: "Failed to load project" }, 500);
  }
  if (!projectResult.value) {
    return c.json({ error: "Project not found" }, 404);
  }

  const allowedStoryPoints = getPointScale(
    projectResult.value.pointScaleType,
    projectResult.value.customPointScale,
  );

  const resolvedStoryId = await resolveStoryIdByNumber(
    storyRepository,
    projectId,
    storyNumberRef,
  );
  if (!resolvedStoryId) {
    return c.json({ error: "Story not found" }, 404);
  }

  const payload = await parseJsonBody(c);
  if (payload === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parseUpdateStoryRequest(payload);
  if (!parsed.ok) {
    return c.json({ error: parsed.message }, 400);
  }

  let placement: StoryPlacement | null = null;
  let storyNumberOfTarget = 0;
  if (payload.placement !== undefined) {
    const parsedPlacement = parseStoryPlacement(payload.placement);
    if (parsedPlacement.isErr()) {
      return c.json({ error: "Invalid placement" }, 400);
    }
    placement = parsedPlacement.value;
    const current = await storyRepository.findById(projectId, resolvedStoryId);
    if (current.isErr() || !current.value) {
      return c.json({ error: "Story not found" }, 404);
    }
    if ((parsed.value.isIcebox ?? current.value.isIcebox) === true) {
      return c.json(
        { error: "Only stories outside the Icebox can be positioned" },
        409,
      );
    }
    const anchor = await resolveStoryPlacementAnchor(
      storyRepository,
      projectId,
      placement,
      current.value.storyNumber,
    );
    storyNumberOfTarget = current.value.storyNumber;
    if (anchor.isErr()) {
      const response = toMoveStoryErrorResponse(anchor.error);
      return c.json({ error: response.message }, response.status);
    }
  }

  const activityRepository = new D1StoryActivityRepository(c.env.DB);
  const notificationRepository = new D1NotificationRepository(c.env.DB);
  const result = await updateStory(
    storyRepository,
    activityRepository,
    {
      projectId,
      id: resolvedStoryId,
      allowedStoryPoints,
      ...parsed.value,
      moveToTopOnLeavingIcebox: true,
      actor: {
        id: actorId,
        name: actorName,
      },
    },
    { notificationRepository, projectRepository },
  );

  const positionOnly =
    placement !== null &&
    result.isErr() &&
    result.error === NO_STORY_FIELDS_TO_UPDATE_ERROR;
  if (result.isErr() && !positionOnly) {
    const response = toUpdateStoryErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  if (placement) {
    const moved = await moveStoryToPosition(storyRepository, {
      projectId,
      storyNumber: storyNumberOfTarget,
      placement,
    });
    if (moved.isErr()) {
      const response = toMoveStoryErrorResponse(moved.error);
      return c.json({ error: response.message }, response.status);
    }
    const positioned = await storyRepository.findById(
      projectId,
      resolvedStoryId,
    );
    if (positioned.isOk() && positioned.value) {
      return c.json({ story: positioned.value });
    }
  }

  if (result.isErr()) {
    return c.json({ error: "Story not found" }, 404);
  }
  return c.json({ story: result.value });
}
