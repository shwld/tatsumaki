import type { Context } from "hono";
import type { ProjectMember } from "../../../../domain/entities/project-member";
import { getPointScale } from "../../../../domain/entities/project";
import { D1NotificationRepository } from "../../../../infrastructure/db/repositories/d1-notification-repository";
import { D1ProjectRepository } from "../../../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryActivityRepository } from "../../../../infrastructure/db/repositories/d1-story-activity-repository";
import { D1StoryRepository } from "../../../../infrastructure/db/repositories/d1-story-repository";
import type { Env } from "../../../../index";
import { updateStory } from "../../../../application/usecases/update-story";
import { toUpdateStoryErrorResponse } from "../../stories/error-responses";
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
      actor: {
        id: actorId,
        name: actorName,
      },
    },
    { notificationRepository },
  );

  if (result.isErr()) {
    const response = toUpdateStoryErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  return c.json({ story: result.value });
}
