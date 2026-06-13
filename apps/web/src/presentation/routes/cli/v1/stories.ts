import { Hono } from "hono";
import {
  getStoryByNumber,
  STORY_NOT_FOUND_ERROR,
} from "../../../../application/usecases/get-story-by-number";
import { listStories } from "../../../../application/usecases/list-stories";
import { reorderStories } from "../../../../application/usecases/reorder-stories";
import { INVALID_STORY_STATUS_ERROR } from "../../../../application/usecases/story-input";
import { createStory } from "../../../../application/usecases/create-story";
import { createStoryComment } from "../../../../application/usecases/create-story-comment";
import { D1NotificationRepository } from "../../../../infrastructure/db/repositories/d1-notification-repository";
import { D1ProjectRepository } from "../../../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryActivityRepository } from "../../../../infrastructure/db/repositories/d1-story-activity-repository";
import { D1StoryCommentRepository } from "../../../../infrastructure/db/repositories/d1-story-comment-repository";
import { D1StoryRepository } from "../../../../infrastructure/db/repositories/d1-story-repository";
import type { Env } from "../../../../index";
import { parseStoryNumberReference } from "../../../lib/story-number-reference";
import { requireProjectMembership } from "../../project-membership";
import {
  toCreateStoryErrorResponse,
  toReorderStoriesErrorResponse,
} from "../../stories/error-responses";
import { STORY_COMMENT_NOT_FOUND_ERROR } from "../../../../domain/repositories/story-comment-repository";
import { getPointScale } from "../../../../domain/entities/project";
import {
  handleCliStoryUpdate,
  resolveStoryIdByNumber,
  parseJsonBody,
} from "./story-handlers";

export const cliV1StoriesRoute = new Hono<Env>();

cliV1StoriesRoute.get("/:projectId/stories/:storyNumber", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
  if (storyNumber === null) {
    return c.json({ error: "Story not found" }, 404);
  }

  const storyRepository = new D1StoryRepository(c.env.DB);
  const storyResult = await getStoryByNumber(storyRepository, {
    projectId,
    storyNumber,
  });
  if (storyResult.isErr() && storyResult.error === STORY_NOT_FOUND_ERROR) {
    return c.json({ error: "Story not found" }, 404);
  }
  if (storyResult.isErr()) {
    return c.json({ error: "Failed to fetch story" }, 500);
  }

  return c.json({ story: storyResult.value });
});

cliV1StoriesRoute.get("/:projectId/stories", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const status = c.req.query("status");
  const iterationDateScope = c.req.query("iterationDateScope");
  const limitRaw = c.req.query("limit");

  if (iterationDateScope !== undefined && iterationDateScope !== "current") {
    return c.json({ error: "iterationDateScope must be 'current'" }, 400);
  }

  const CLI_DEFAULT_LIMIT = 100;
  const CLI_MAX_LIMIT = 500;

  let limit: number = CLI_DEFAULT_LIMIT;
  if (limitRaw !== undefined) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return c.json({ error: "limit must be a positive integer" }, 400);
    }
    limit = Math.min(parsed, CLI_MAX_LIMIT);
  }

  const storyRepository = new D1StoryRepository(c.env.DB);
  const result = await listStories(storyRepository, {
    projectId,
    ...(status !== undefined ? { status } : {}),
    ...(iterationDateScope === "current"
      ? { iterationDateScope: "current" as const }
      : {}),
    limit,
    detailLevel: "summary",
  });

  if (result.isErr()) {
    if (result.error === INVALID_STORY_STATUS_ERROR) {
      return c.json({ error: "Invalid status" }, 400);
    }
    return c.json({ error: "Failed to fetch stories" }, 500);
  }

  return c.json({ stories: result.value });
});

cliV1StoriesRoute.post("/:projectId/stories", async (c) => {
  const projectId = c.req.param("projectId");
  const currentUser = c.get("currentUser");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const payload = await parseJsonBody(c);
  if (payload === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const repository = new D1StoryRepository(c.env.DB);
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
  const activityRepository = new D1StoryActivityRepository(c.env.DB);
  const notificationRepository = new D1NotificationRepository(c.env.DB);
  const result = await createStory(
    repository,
    activityRepository,
    {
      projectId,
      title: payload.title ?? "",
      type: payload.type ?? "",
      description: payload.description ?? "",
      status: "Unstarted",
      isIcebox: payload.isIcebox ?? false,
      storyPoint: null,
      allowedStoryPoints,
      labels: [],
      actorUserId: membership.member.userId,
      actorName: currentUser.email ?? currentUser.id,
    },
    { notificationRepository },
  );

  if (result.isErr()) {
    const response = toCreateStoryErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  return c.json({ story: result.value }, 201);
});

cliV1StoriesRoute.post("/:projectId/stories/reorder", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const payload = await parseJsonBody(c);
  if (payload === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const orderedIds = Array.isArray(payload.orderedIds)
    ? payload.orderedIds.filter(
        (id: unknown): id is string => typeof id === "string",
      )
    : null;
  if (!orderedIds || orderedIds.length === 0) {
    return c.json({ error: "orderedIds must be a string array" }, 400);
  }

  const repository = new D1StoryRepository(c.env.DB);
  const result = await reorderStories(repository, projectId, orderedIds);
  if (result.isErr()) {
    const response = toReorderStoriesErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  return c.json({ stories: result.value });
});

cliV1StoriesRoute.patch("/:projectId/stories/:storyNumber", async (c) => {
  const projectId = c.req.param("projectId");
  const currentUser = c.get("currentUser");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  return handleCliStoryUpdate(
    c,
    membership.member,
    membership.member.userId,
    currentUser.email ?? currentUser.id,
  );
});

cliV1StoriesRoute.post(
  "/:projectId/stories/:storyNumber/comments",
  async (c) => {
    const projectId = c.req.param("projectId");
    const currentUser = c.get("currentUser");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }
    const payload = await parseJsonBody(c);
    if (payload === null) {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (typeof payload.body !== "string" || payload.body.length === 0) {
      return c.json({ error: "body is required" }, 400);
    }
    const storyRepository = new D1StoryRepository(c.env.DB);
    const resolvedStoryId = await resolveStoryIdByNumber(
      storyRepository,
      projectId,
      c.req.param("storyNumber"),
    );
    if (!resolvedStoryId) {
      return c.json({ error: "Story not found" }, 404);
    }
    const repository = new D1StoryCommentRepository(c.env.DB);
    const result = await createStoryComment(repository, {
      projectId,
      storyId: resolvedStoryId,
      userId: membership.member.userId,
      actorName: currentUser.email ?? currentUser.id,
      body: payload.body,
    });
    if (result.isErr()) {
      if (result.error === STORY_COMMENT_NOT_FOUND_ERROR) {
        return c.json({ error: "Story not found" }, 404);
      }
      return c.json({ error: "Failed to create comment" }, 500);
    }
    return c.json({ comment: result.value }, 201);
  },
);
