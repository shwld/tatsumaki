import { Hono } from "hono";
import { addStoryBlocker } from "../../application/usecases/add-story-blocker";
import {
  bulkAddStoryLabels,
  EMPTY_LABELS_ERROR,
  EMPTY_STORY_IDS_ERROR as EMPTY_STORY_IDS_FOR_LABELS_ERROR,
} from "../../application/usecases/bulk-add-story-labels";
import {
  bulkUpdateStoryStatus,
  EMPTY_STORY_IDS_ERROR as EMPTY_STORY_IDS_FOR_STATUS_ERROR,
} from "../../application/usecases/bulk-update-story-status";
import { createStoryForPanel } from "../../application/usecases/create-story-for-panel";
import { createAssigneeCommentNotifications } from "../../application/usecases/create-assignee-comment-notifications";
import { createMentionNotifications } from "../../application/usecases/create-mention-notifications";
import { createStoryComment } from "../../application/usecases/create-story-comment";
import {
  deleteStoryAttachment,
  STORY_ATTACHMENT_DELETE_ERROR,
} from "../../application/usecases/delete-story-attachment";
import { deleteStory } from "../../application/usecases/delete-story";
import {
  deleteStoryComment,
  COMMENT_NOT_FOUND_ERROR as DELETE_COMMENT_NOT_FOUND,
  COMMENT_FORBIDDEN_ERROR as DELETE_COMMENT_FORBIDDEN,
} from "../../application/usecases/delete-story-comment";
import {
  getStoryAttachmentContent,
  STORY_ATTACHMENT_DOWNLOAD_ERROR,
  STORY_ATTACHMENT_OBJECT_NOT_FOUND_ERROR,
} from "../../application/usecases/get-story-attachment-content";
import { listStories } from "../../application/usecases/list-stories";
import { summarizeStories } from "../../application/usecases/summarize-stories";
import { listStoryAttachments } from "../../application/usecases/list-story-attachments";
import { listStoryPriorityHistory } from "../../application/usecases/list-story-priority-history";
import { listStoryTimeline } from "../../application/usecases/list-story-timeline";
import { removeStoryBlocker } from "../../application/usecases/remove-story-blocker";
import { reorderStories } from "../../application/usecases/reorder-stories";
import {
  uploadStoryAttachment,
  STORY_ATTACHMENT_UPLOAD_ERROR,
} from "../../application/usecases/upload-story-attachment";
import { updateStory } from "../../application/usecases/update-story";
import {
  updateStoryComment,
  COMMENT_NOT_FOUND_ERROR as UPDATE_COMMENT_NOT_FOUND,
  COMMENT_FORBIDDEN_ERROR as UPDATE_COMMENT_FORBIDDEN,
} from "../../application/usecases/update-story-comment";
import { D1StoryActivityRepository } from "../../infrastructure/db/repositories/d1-story-activity-repository";
import { D1StoryAttachmentRepository } from "../../infrastructure/db/repositories/d1-story-attachment-repository";
import { D1StoryCommentRepository } from "../../infrastructure/db/repositories/d1-story-comment-repository";
import { D1StoryTimelineReadRepository } from "../../infrastructure/db/repositories/d1-story-timeline-read-repository";
import { D1IterationRepository } from "../../infrastructure/db/repositories/d1-iteration-repository";
import { D1NotificationRepository } from "../../infrastructure/db/repositories/d1-notification-repository";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import {
  INVALID_STORY_STATUS_ERROR,
  INVALID_STORY_TYPE_ERROR,
} from "../../application/usecases/story-input";
import { getPointScale } from "../../domain/entities/project";
import { STORY_ATTACHMENT_NOT_FOUND_ERROR } from "../../domain/repositories/story-attachment-repository";
import type { StoryAttachmentObjectStore } from "../../application/ports/story-attachment-object-store";
import { D1StoryRepository } from "../../infrastructure/db/repositories/d1-story-repository";
import { InMemoryStoryAttachmentObjectStore } from "../../infrastructure/storage/in-memory-story-attachment-object-store";
import { R2StoryAttachmentObjectStore } from "../../infrastructure/storage/r2-story-attachment-object-store";
import type { Env } from "../../index";
import { requireProjectMembership } from "./project-membership";
import {
  STORY_TYPE_ERROR_MESSAGE,
  toCreateStoryErrorResponse,
  toDeleteStoryErrorResponse,
  toReorderStoriesErrorResponse,
  toUpdateStoryErrorResponse,
} from "./stories/error-responses";
import {
  parseBulkAddStoryLabelsRequest,
  parseBulkUpdateStoryStatusRequest,
  parseCreateStoryRequest,
  parseReorderStoriesRequest,
  parseStoryBlockerRequest,
  parseUpdateStoryRequest,
} from "./stories/request-parsers";
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
} from "../lib/timeline-cursor";
import { parseStoryNumberReference } from "../lib/story-number-reference";

const DEFAULT_STORY_TIMELINE_LIMIT = 30;
const MAX_STORY_TIMELINE_LIMIT = 100;

function parseStoryTimelineLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") {
    return DEFAULT_STORY_TIMELINE_LIMIT;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    return null;
  }
  return Math.min(value, MAX_STORY_TIMELINE_LIMIT);
}

export const storiesRoute = new Hono<Env>();
const inMemoryAttachmentObjectStore = new InMemoryStoryAttachmentObjectStore();

const MAX_STORY_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_STORY_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

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

function normalizeStoryAttachmentMimeType(raw: string): string {
  return raw.trim().toLowerCase();
}

function toContentDisposition(fileName: string, isDownload: boolean): string {
  const escaped = fileName.replace(/"/g, '\\"');
  const encoded = encodeURIComponent(fileName);
  const mode = isDownload ? "attachment" : "inline";
  return `${mode}; filename="${escaped}"; filename*=UTF-8''${encoded}`;
}

function toAttachmentResponse(attachment: {
  id: string;
  storyId: string;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
}) {
  return {
    __typename: "StoryAttachment" as const,
    id: attachment.id,
    storyId: attachment.storyId,
    fileName: attachment.fileName,
    fileKey: attachment.fileKey,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    uploadedBy: attachment.uploadedBy,
    createdAt: attachment.createdAt,
  };
}

function createStoryAttachmentObjectStore(
  bucket: R2Bucket | undefined,
): StoryAttachmentObjectStore {
  if (bucket) {
    return new R2StoryAttachmentObjectStore(bucket);
  }

  return inMemoryAttachmentObjectStore;
}

storiesRoute.get("/projects/:projectId/stories", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1StoryRepository(c.env.DB);
  const status = c.req.query("status");
  const query = c.req.query("q");
  const statusesRaw = c.req.query("statuses");
  const typesRaw = c.req.query("types");
  const owner = c.req.query("owner");
  const ownersRaw = c.req.query("owners");
  const requester = c.req.query("requester");
  const myWork = c.req.query("myWork");
  const label = c.req.query("label");
  const labelsRaw = c.req.query("labels");
  const epicId = c.req.query("epicId");
  const epicIdsRaw = c.req.query("epicIds");
  const isIcebox = c.req.query("isIcebox");
  const iterationId = c.req.query("iterationId");
  const excludeIterationId = c.req.query("excludeIterationId");
  const iterationDateScopeRaw = c.req.query("iterationDateScope");
  const includeUnassignedIterationRaw = c.req.query(
    "includeUnassignedIteration",
  );
  const limitRaw = c.req.query("limit");
  const offsetRaw = c.req.query("offset");
  const orderRaw = c.req.query("order");
  const iterationDateScope =
    iterationDateScopeRaw === "past" ||
    iterationDateScopeRaw === "current" ||
    iterationDateScopeRaw === "future"
      ? iterationDateScopeRaw
      : undefined;
  const includeUnassignedIteration =
    includeUnassignedIterationRaw === "true" ||
    includeUnassignedIterationRaw === "1"
      ? true
      : includeUnassignedIterationRaw === "false" ||
          includeUnassignedIterationRaw === "0"
        ? false
        : undefined;

  function parseCsvParam(raw: string | undefined, maxItems = 50): string[] {
    if (!raw) return [];
    return raw
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .slice(0, maxItems);
  }

  const statuses = parseCsvParam(statusesRaw);
  const types = parseCsvParam(typesRaw);
  const owners = parseCsvParam(ownersRaw);
  const labels = parseCsvParam(labelsRaw);
  const epicIds = parseCsvParam(epicIdsRaw);

  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const parsedOffset = offsetRaw ? Number.parseInt(offsetRaw, 10) : undefined;
  const pageLimit =
    typeof parsedLimit === "number" &&
    Number.isInteger(parsedLimit) &&
    parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : undefined;
  const pageOffset =
    typeof parsedOffset === "number" &&
    Number.isInteger(parsedOffset) &&
    parsedOffset >= 0
      ? parsedOffset
      : 0;
  const order =
    orderRaw === "statusChangedAtAsc" ||
    orderRaw === "statusChangedAtDesc" ||
    orderRaw === "positionAsc" ||
    orderRaw === "currentAcceptedFirst"
      ? orderRaw
      : undefined;
  const detailRaw = c.req.query("detail");
  const detailLevel =
    detailRaw === "full" || detailRaw === "summary" ? detailRaw : undefined;

  const listInput: Parameters<typeof listStories>[1] = {
    projectId,
    ...(query ? { query } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(statuses.length > 0 ? { statuses } : {}),
    ...(types.length > 0 ? { types } : {}),
    ...(myWork === "true" || myWork === "1"
      ? { ownerId: c.get("currentUser").id }
      : owner
        ? { ownerId: owner }
        : owners.length > 0
          ? { ownerIds: owners }
          : {}),
    ...(requester ? { requesterId: requester } : {}),
    ...(label ? { label } : {}),
    ...(labels.length > 0 ? { labels } : {}),
    ...(epicId ? { epicId } : {}),
    ...(epicIds.length > 0 ? { epicIds } : {}),
    ...(isIcebox === "true" || isIcebox === "1"
      ? { isIcebox: true }
      : isIcebox === "false" || isIcebox === "0"
        ? { isIcebox: false }
        : {}),
    ...(iterationId ? { iterationId } : {}),
    ...(excludeIterationId ? { excludeIterationId } : {}),
    ...(iterationDateScope ? { iterationDateScope } : {}),
    ...(includeUnassignedIteration !== undefined
      ? { includeUnassignedIteration }
      : {}),
    ...(pageLimit !== undefined ? { limit: pageLimit + 1 } : {}),
    ...(pageLimit !== undefined ? { offset: pageOffset } : {}),
    ...(order ? { order } : {}),
    ...(detailLevel ? { detailLevel } : {}),
  };

  const result = await listStories(repository, listInput);

  if (result.isErr()) {
    if (result.error === INVALID_STORY_STATUS_ERROR) {
      return c.json(
        {
          error:
            "Story status must be Unstarted, Started, Finished, Delivered, or Accepted",
        },
        400,
      );
    }
    if (result.error === INVALID_STORY_TYPE_ERROR) {
      return c.json(
        {
          error: STORY_TYPE_ERROR_MESSAGE,
        },
        400,
      );
    }

    return c.json({ error: "Failed to load stories" }, 500);
  }

  if (pageLimit !== undefined) {
    const summaryResult = await summarizeStories(repository, {
      ...listInput,
      limit: undefined,
      offset: undefined,
    });

    if (summaryResult.isErr()) {
      if (summaryResult.error === INVALID_STORY_STATUS_ERROR) {
        return c.json(
          {
            error:
              "Story status must be Unstarted, Started, Finished, Delivered, or Accepted",
          },
          400,
        );
      }

      if (summaryResult.error === INVALID_STORY_TYPE_ERROR) {
        return c.json(
          {
            error: STORY_TYPE_ERROR_MESSAGE,
          },
          400,
        );
      }

      return c.json({ error: "Failed to load stories" }, 500);
    }

    const hasNext = result.value.length > pageLimit;
    const stories = hasNext ? result.value.slice(0, pageLimit) : result.value;
    const offset = pageOffset;
    const nextOffset = hasNext ? offset + pageLimit : null;
    const prevOffset = offset > 0 ? Math.max(0, offset - pageLimit) : null;
    return c.json({
      stories,
      pagination: {
        limit: pageLimit,
        offset,
        hasNext,
        hasPrev: offset > 0,
        nextOffset,
        prevOffset,
        total: summaryResult.value.total,
        summary: {
          totalPoints: summaryResult.value.totalPoints,
          pointsByIterationId: summaryResult.value.pointsByIterationId,
        },
      },
    });
  }

  return c.json({ stories: result.value });
});

storiesRoute.post("/projects/:projectId/stories", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseCreateStoryRequest(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.message }, 400);
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
  const iterationRepository = new D1IterationRepository(c.env.DB);
  const notificationRepository = new D1NotificationRepository(c.env.DB);
  const result = await createStoryForPanel(
    repository,
    activityRepository,
    iterationRepository,
    {
      projectId,
      panel: parsed.value.panel,
      title: parsed.value.title,
      description: parsed.value.description,
      type: parsed.value.type,
      status: parsed.value.status,
      storyPoint: parsed.value.storyPoint,
      allowedStoryPoints,
      labels: parsed.value.labels,
      epicId: parsed.value.epicId,
      ownerIds: parsed.value.ownerIds,
      requesterId: parsed.value.requesterId,
      releaseDate: parsed.value.releaseDate,
      actorUserId: c.get("currentUser").id,
      actorName: c.get("currentUser").email ?? c.get("currentUser").id,
    },
    { notificationRepository },
  );

  if (result.isErr()) {
    const response = toCreateStoryErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  return c.json({ story: result.value }, 201);
});

storiesRoute.patch("/projects/:projectId/stories/bulk-status", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseBulkUpdateStoryStatusRequest(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.message }, 400);
  }

  const repository = new D1StoryRepository(c.env.DB);
  const activityRepository = new D1StoryActivityRepository(c.env.DB);
  const notificationRepository = new D1NotificationRepository(c.env.DB);
  const result = await bulkUpdateStoryStatus(
    repository,
    activityRepository,
    {
      projectId,
      storyIds: parsed.value.storyIds,
      status: parsed.value.status,
      actor: {
        id: c.get("currentUser").id,
        name: c.get("currentUser").email ?? c.get("currentUser").id,
      },
    },
    { notificationRepository },
  );

  if (result.isErr()) {
    if (result.error === EMPTY_STORY_IDS_FOR_STATUS_ERROR) {
      return c.json({ error: "storyIds must not be empty" }, 400);
    }
    const response = toUpdateStoryErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  return c.json({ stories: result.value });
});

storiesRoute.patch("/projects/:projectId/stories/bulk-labels", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseBulkAddStoryLabelsRequest(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.message }, 400);
  }

  const repository = new D1StoryRepository(c.env.DB);
  const activityRepository = new D1StoryActivityRepository(c.env.DB);
  const notificationRepository = new D1NotificationRepository(c.env.DB);
  const result = await bulkAddStoryLabels(
    repository,
    activityRepository,
    {
      projectId,
      storyIds: parsed.value.storyIds,
      labels: parsed.value.labels,
      actor: {
        id: c.get("currentUser").id,
        name: c.get("currentUser").email ?? c.get("currentUser").id,
      },
    },
    { notificationRepository },
  );

  if (result.isErr()) {
    if (result.error === EMPTY_STORY_IDS_FOR_LABELS_ERROR) {
      return c.json({ error: "storyIds must not be empty" }, 400);
    }
    if (result.error === EMPTY_LABELS_ERROR) {
      return c.json({ error: "labels must not be empty" }, 400);
    }
    const response = toUpdateStoryErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  return c.json({ stories: result.value });
});

storiesRoute.patch("/projects/:projectId/stories/:storyNumber", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseUpdateStoryRequest(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.message }, 400);
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
  const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
  if (storyNumber === null) {
    return c.json({ error: "Story not found" }, 404);
  }
  const beforeStoryResult = await repository.findByStoryNumber(
    projectId,
    storyNumber,
  );
  if (beforeStoryResult.isErr()) {
    return c.json({ error: "Failed to fetch story" }, 500);
  }
  if (!beforeStoryResult.value) {
    return c.json({ error: "Story not found" }, 404);
  }
  const activityRepository = new D1StoryActivityRepository(c.env.DB);
  const notificationRepository = new D1NotificationRepository(c.env.DB);
  const result = await updateStory(
    repository,
    activityRepository,
    {
      actor: {
        id: c.get("currentUser").id,
        name: c.get("currentUser").email ?? c.get("currentUser").id,
      },
      projectId,
      id: beforeStoryResult.value.id,
      allowedStoryPoints,
      ...parsed.value,
    },
    { notificationRepository },
  );

  if (result.isErr()) {
    const response = toUpdateStoryErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  if (
    parsed.value.description !== undefined &&
    beforeStoryResult.value.description !== result.value.description
  ) {
    const membersResult = await membership.repository.listMembers(projectId);
    if (membersResult.isErr()) {
      return c.json({ error: "Failed to resolve project members" }, 500);
    }

    const mentionResult = await createMentionNotifications(
      new D1NotificationRepository(c.env.DB),
      {
        projectId,
        storyId: result.value.id,
        storyTitle: result.value.title,
        actorUserId: c.get("currentUser").id,
        actorName: c.get("currentUser").email ?? c.get("currentUser").id,
        sourceType: "story_description",
        sourceId: `${result.value.id}:${result.value.updatedAt}`,
        text: result.value.description,
        memberUserIds: membersResult.value.map((member) => member.userId),
      },
    );
    if (mentionResult.isErr()) {
      return c.json({ error: "Failed to create mention notifications" }, 500);
    }
  }

  return c.json({ story: result.value });
});

storiesRoute.delete("/projects/:projectId/stories/:storyNumber", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1StoryRepository(c.env.DB);
  const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
  if (storyNumber === null) {
    return c.json({ error: "Story not found" }, 404);
  }
  const storyResult = await repository.findByStoryNumber(
    projectId,
    storyNumber,
  );
  if (storyResult.isErr()) {
    return c.json({ error: "Failed to resolve story" }, 500);
  }
  if (!storyResult.value) {
    return c.json({ error: "Story not found" }, 404);
  }
  const activityRepository = new D1StoryActivityRepository(c.env.DB);
  const commentRepository = new D1StoryCommentRepository(c.env.DB);
  const notificationRepository = new D1NotificationRepository(c.env.DB);
  const result = await deleteStory(
    repository,
    activityRepository,
    commentRepository,
    {
      projectId,
      storyId: storyResult.value.id,
      actorUserId: c.get("currentUser").id,
      actorName: c.get("currentUser").email ?? c.get("currentUser").id,
    },
    { notificationRepository },
  );

  if (result.isErr()) {
    const response = toDeleteStoryErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  return c.body(null, 204);
});

storiesRoute.put("/projects/:projectId/stories/reorder", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseReorderStoriesRequest(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.message }, 400);
  }

  const repository = new D1StoryRepository(c.env.DB);
  const result = await reorderStories(
    repository,
    projectId,
    parsed.value.orderedIds,
  );

  if (result.isErr()) {
    const response = toReorderStoriesErrorResponse(result.error);
    return c.json({ error: response.message }, response.status);
  }

  return c.json({ stories: result.value });
});

storiesRoute.get(
  "/projects/:projectId/stories/:storyNumber/timeline",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const limit = parseStoryTimelineLimit(c.req.query("limit"));
    if (limit === null) {
      return c.json({ error: "Invalid limit" }, 400);
    }

    const beforeRaw = c.req.query("before");
    let before: { createdAt: string; id: string } | undefined;
    if (beforeRaw !== undefined && beforeRaw !== "") {
      const decoded = decodeTimelineCursor(beforeRaw);
      if (!decoded.ok) {
        return c.json({ error: "Invalid cursor" }, 400);
      }
      before = { createdAt: decoded.createdAt, id: decoded.id };
    }

    const readRepository = new D1StoryTimelineReadRepository(c.env.DB);
    const storyRepository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await storyRepository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }
    const result = await listStoryTimeline(readRepository, {
      projectId,
      storyId: storyResult.value.id,
      limit,
      before,
    });

    if (result.isErr()) {
      return c.json({ error: "Failed to load story timeline" }, 500);
    }

    const page = result.value;
    const nextCursor =
      page.hasMore && page.nextBefore
        ? encodeTimelineCursor(page.nextBefore.createdAt, page.nextBefore.id)
        : null;

    return c.json({
      timeline: page.entries,
      hasMore: page.hasMore,
      nextCursor,
    });
  },
);

storiesRoute.get("/projects/:projectId/stories/priority-history", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1StoryRepository(c.env.DB);
  const result = await listStoryPriorityHistory(repository, projectId);

  if (result.isErr()) {
    return c.json({ error: "Failed to load story priority history" }, 500);
  }

  return c.json({ history: result.value });
});

storiesRoute.get("/projects/:projectId/stories/:storyNumber", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1StoryRepository(c.env.DB);
  const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
  if (storyNumber === null) {
    return c.json({ error: "Story not found" }, 404);
  }
  const result = await repository.findByStoryNumber(projectId, storyNumber);
  if (result.isErr()) {
    return c.json({ error: "Failed to fetch story" }, 500);
  }
  if (!result.value) {
    return c.json({ error: "Story not found" }, 404);
  }

  return c.json({ story: result.value });
});

storiesRoute.post(
  "/projects/:projectId/stories/:storyNumber/blockers",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = parseStoryBlockerRequest(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.message }, 400);
    }

    const repository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await repository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }
    const targetStoryResult = await resolveStoryByReference(
      repository,
      projectId,
      parsed.value.targetStoryId,
    );
    if (targetStoryResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!targetStoryResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    const blockingStoryId =
      parsed.value.relation === "blockedBy"
        ? targetStoryResult.value.id
        : storyResult.value.id;
    const blockedStoryId =
      parsed.value.relation === "blockedBy"
        ? storyResult.value.id
        : targetStoryResult.value.id;

    if (blockingStoryId === blockedStoryId) {
      return c.json({ error: "A story cannot block itself" }, 400);
    }

    const [blockingStoryResult, blockedStoryResult] = await Promise.all([
      repository.findById(projectId, blockingStoryId),
      repository.findById(projectId, blockedStoryId),
    ]);

    if (blockingStoryResult.isErr() || blockedStoryResult.isErr()) {
      return c.json({ error: "Failed to update story blockers" }, 500);
    }

    if (!blockingStoryResult.value || !blockedStoryResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    const addResult = await addStoryBlocker(repository, {
      blockingStoryId,
      blockedStoryId,
    });
    if (addResult.isErr()) {
      return c.json({ error: "Failed to update story blockers" }, 500);
    }

    const [updatedStoryResult, relatedUpdatedStoryResult] = await Promise.all([
      repository.findById(projectId, storyResult.value.id),
      repository.findById(projectId, targetStoryResult.value.id),
    ]);
    if (
      updatedStoryResult.isErr() ||
      !updatedStoryResult.value ||
      relatedUpdatedStoryResult.isErr() ||
      !relatedUpdatedStoryResult.value
    ) {
      return c.json({ error: "Failed to load updated story" }, 500);
    }

    return c.json({
      story: updatedStoryResult.value,
      relatedStory: relatedUpdatedStoryResult.value,
    });
  },
);

storiesRoute.delete(
  "/projects/:projectId/stories/:storyNumber/blockers",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = parseStoryBlockerRequest(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.message }, 400);
    }

    const repository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await repository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }
    const targetStoryResult = await resolveStoryByReference(
      repository,
      projectId,
      parsed.value.targetStoryId,
    );
    if (targetStoryResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!targetStoryResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    const blockingStoryId =
      parsed.value.relation === "blockedBy"
        ? targetStoryResult.value.id
        : storyResult.value.id;
    const blockedStoryId =
      parsed.value.relation === "blockedBy"
        ? storyResult.value.id
        : targetStoryResult.value.id;

    if (blockingStoryId === blockedStoryId) {
      return c.json({ error: "A story cannot block itself" }, 400);
    }

    const removeResult = await removeStoryBlocker(repository, {
      blockingStoryId,
      blockedStoryId,
    });
    if (removeResult.isErr()) {
      return c.json({ error: "Failed to update story blockers" }, 500);
    }

    const [updatedStoryResult, relatedUpdatedStoryResult] = await Promise.all([
      repository.findById(projectId, storyResult.value.id),
      repository.findById(projectId, targetStoryResult.value.id),
    ]);
    if (
      updatedStoryResult.isErr() ||
      !updatedStoryResult.value ||
      relatedUpdatedStoryResult.isErr() ||
      !relatedUpdatedStoryResult.value
    ) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.json({
      story: updatedStoryResult.value,
      relatedStory: relatedUpdatedStoryResult.value,
    });
  },
);

storiesRoute.get(
  "/projects/:projectId/stories/:storyNumber/attachments",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const storyRepository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await storyRepository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    const repository = new D1StoryAttachmentRepository(c.env.DB);
    const result = await listStoryAttachments(repository, {
      projectId,
      storyId: storyResult.value.id,
    });
    if (result.isErr()) {
      return c.json({ error: "Failed to load attachments" }, 500);
    }

    return c.json({
      attachments: result.value.map((attachment) => {
        return toAttachmentResponse(attachment);
      }),
    });
  },
);

storiesRoute.post(
  "/projects/:projectId/stories/:storyNumber/attachments",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const storyRepository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await storyRepository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: "Invalid form data" }, 400);
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    if (file.size <= 0) {
      return c.json({ error: "file must not be empty" }, 400);
    }
    if (!file.name.trim()) {
      return c.json({ error: "file name is required" }, 400);
    }
    if (!file.stream) {
      return c.json({ error: "file stream is not available" }, 400);
    }

    if (file.size > MAX_STORY_ATTACHMENT_BYTES) {
      return c.json({ error: "File too large" }, 413);
    }

    const normalizedMime = normalizeStoryAttachmentMimeType(file.type || "");
    if (
      !normalizedMime ||
      !ALLOWED_STORY_ATTACHMENT_MIME_TYPES.has(normalizedMime)
    ) {
      return c.json({ error: "Unsupported file type" }, 400);
    }

    const repository = new D1StoryAttachmentRepository(c.env.DB);
    const objectStore = createStoryAttachmentObjectStore(
      c.env.STORY_ATTACHMENTS,
    );
    const result = await uploadStoryAttachment(repository, objectStore, {
      projectId,
      storyId: storyResult.value.id,
      uploadedBy: c.get("currentUser").id,
      fileName: file.name,
      mimeType: normalizedMime,
      fileSize: file.size,
      fileBody: file.stream(),
    });

    if (result.isErr()) {
      if (result.error === STORY_ATTACHMENT_NOT_FOUND_ERROR) {
        return c.json({ error: "Story not found" }, 404);
      }
      if (result.error === STORY_ATTACHMENT_UPLOAD_ERROR) {
        return c.json({ error: "Failed to store attachment" }, 500);
      }
      return c.json({ error: "Failed to upload attachment" }, 500);
    }

    return c.json({ attachment: toAttachmentResponse(result.value) }, 201);
  },
);

storiesRoute.get(
  "/projects/:projectId/stories/:storyNumber/attachments/:attachmentId/content",
  async (c) => {
    const projectId = c.req.param("projectId");
    const attachmentId = c.req.param("attachmentId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const storyRepository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await storyRepository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    const repository = new D1StoryAttachmentRepository(c.env.DB);
    const objectStore = createStoryAttachmentObjectStore(
      c.env.STORY_ATTACHMENTS,
    );
    const result = await getStoryAttachmentContent(repository, objectStore, {
      projectId,
      storyId: storyResult.value.id,
      attachmentId,
    });

    if (result.isErr()) {
      if (
        result.error === STORY_ATTACHMENT_NOT_FOUND_ERROR ||
        result.error === STORY_ATTACHMENT_OBJECT_NOT_FOUND_ERROR
      ) {
        return c.json({ error: "Attachment not found" }, 404);
      }
      if (result.error === STORY_ATTACHMENT_DOWNLOAD_ERROR) {
        return c.json({ error: "Failed to download attachment" }, 500);
      }
      return c.json({ error: "Failed to load attachment" }, 500);
    }

    const isDownload = c.req.query("download") === "1";
    c.header("content-type", result.value.attachment.mimeType);
    c.header("X-Content-Type-Options", "nosniff");
    c.header(
      "content-disposition",
      toContentDisposition(result.value.attachment.fileName, isDownload),
    );
    c.header("cache-control", "private, max-age=0, must-revalidate");
    if (result.value.object.httpEtag) {
      c.header("etag", result.value.object.httpEtag);
    }

    return c.body(result.value.object.body);
  },
);

storiesRoute.delete(
  "/projects/:projectId/stories/:storyNumber/attachments/:attachmentId",
  async (c) => {
    const projectId = c.req.param("projectId");
    const attachmentId = c.req.param("attachmentId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const storyRepository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await storyRepository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    const repository = new D1StoryAttachmentRepository(c.env.DB);
    const objectStore = createStoryAttachmentObjectStore(
      c.env.STORY_ATTACHMENTS,
    );
    const result = await deleteStoryAttachment(repository, objectStore, {
      projectId,
      storyId: storyResult.value.id,
      attachmentId,
    });

    if (result.isErr()) {
      if (result.error === STORY_ATTACHMENT_NOT_FOUND_ERROR) {
        return c.json({ error: "Attachment not found" }, 404);
      }
      if (result.error === STORY_ATTACHMENT_DELETE_ERROR) {
        return c.json({ error: "Failed to delete attachment object" }, 500);
      }
      return c.json({ error: "Failed to delete attachment" }, 500);
    }

    return c.body(null, 204);
  },
);

// Comment CRUD routes

storiesRoute.post(
  "/projects/:projectId/stories/:storyNumber/comments",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const storyRepository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await storyRepository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("body" in body) ||
      typeof (body as { body: unknown }).body !== "string" ||
      (body as { body: string }).body.trim() === ""
    ) {
      return c.json({ error: "body is required" }, 400);
    }

    const commentBody = (body as { body: string }).body;
    const story = storyResult.value;

    const commentRepository = new D1StoryCommentRepository(c.env.DB);
    const currentUser = c.get("currentUser");
    const result = await createStoryComment(commentRepository, {
      projectId,
      storyId: story.id,
      userId: currentUser.id,
      actorName: currentUser.email ?? currentUser.id,
      body: commentBody,
    });

    if (result.isErr()) {
      return c.json({ error: "Failed to create comment" }, 500);
    }

    const membersResult = await membership.repository.listMembers(projectId);
    if (membersResult.isErr()) {
      return c.json({ error: "Failed to resolve project members" }, 500);
    }

    const notificationRepository = new D1NotificationRepository(c.env.DB);
    const mentionResult = await createMentionNotifications(
      notificationRepository,
      {
        projectId,
        storyId: story.id,
        storyTitle: story.title,
        actorUserId: currentUser.id,
        actorName: currentUser.email ?? currentUser.id,
        sourceType: "comment",
        sourceId: result.value.id,
        text: result.value.body,
        memberUserIds: membersResult.value.map((member) => member.userId),
        createdAt: result.value.createdAt,
      },
    );

    if (mentionResult.isErr()) {
      return c.json({ error: "Failed to create mention notifications" }, 500);
    }

    const assigneeCommentResult = await createAssigneeCommentNotifications(
      notificationRepository,
      {
        projectId,
        storyId: story.id,
        storyTitle: story.title,
        ownerIds: story.ownerIds,
        actorUserId: currentUser.id,
        actorName: currentUser.email ?? currentUser.id,
        commentId: result.value.id,
        commentBody: result.value.body,
        createdAt: result.value.createdAt,
      },
    );

    if (assigneeCommentResult.isErr()) {
      return c.json({ error: "Failed to create comment notifications" }, 500);
    }

    return c.json({ comment: result.value }, 201);
  },
);

storiesRoute.patch(
  "/projects/:projectId/stories/:storyNumber/comments/:commentId",
  async (c) => {
    const projectId = c.req.param("projectId");
    const commentId = c.req.param("commentId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("body" in body) ||
      typeof (body as { body: unknown }).body !== "string" ||
      (body as { body: string }).body.trim() === ""
    ) {
      return c.json({ error: "body is required" }, 400);
    }

    const commentBody = (body as { body: string }).body;
    const storyRepository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await storyRepository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    const commentRepository = new D1StoryCommentRepository(c.env.DB);
    const commentLookup = await commentRepository.findById(
      projectId,
      commentId,
    );
    if (commentLookup.isErr()) {
      return c.json({ error: "Failed to resolve comment" }, 500);
    }
    if (
      !commentLookup.value ||
      commentLookup.value.storyId !== storyResult.value.id
    ) {
      return c.json({ error: "Comment not found" }, 404);
    }
    const currentUser = c.get("currentUser");
    const result = await updateStoryComment(commentRepository, {
      projectId,
      commentId,
      userId: currentUser.id,
      body: commentBody,
    });

    if (result.isErr()) {
      if (result.error === UPDATE_COMMENT_NOT_FOUND) {
        return c.json({ error: "Comment not found" }, 404);
      }
      if (result.error === UPDATE_COMMENT_FORBIDDEN) {
        return c.json({ error: "You can only edit your own comments" }, 403);
      }
      return c.json({ error: "Failed to update comment" }, 500);
    }

    return c.json({ comment: result.value });
  },
);

storiesRoute.delete(
  "/projects/:projectId/stories/:storyNumber/comments/:commentId",
  async (c) => {
    const projectId = c.req.param("projectId");
    const commentId = c.req.param("commentId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const commentRepository = new D1StoryCommentRepository(c.env.DB);
    const storyRepository = new D1StoryRepository(c.env.DB);
    const storyNumber = parseStoryNumberReference(c.req.param("storyNumber"));
    if (storyNumber === null) {
      return c.json({ error: "Story not found" }, 404);
    }
    const storyResult = await storyRepository.findByStoryNumber(
      projectId,
      storyNumber,
    );
    if (storyResult.isErr()) {
      return c.json({ error: "Failed to resolve story" }, 500);
    }
    if (!storyResult.value) {
      return c.json({ error: "Story not found" }, 404);
    }
    const commentLookup = await commentRepository.findById(
      projectId,
      commentId,
    );
    if (commentLookup.isErr()) {
      return c.json({ error: "Failed to resolve comment" }, 500);
    }
    if (
      !commentLookup.value ||
      commentLookup.value.storyId !== storyResult.value.id
    ) {
      return c.json({ error: "Comment not found" }, 404);
    }
    const currentUser = c.get("currentUser");
    const result = await deleteStoryComment(commentRepository, {
      projectId,
      commentId,
      userId: currentUser.id,
    });

    if (result.isErr()) {
      if (result.error === DELETE_COMMENT_NOT_FOUND) {
        return c.json({ error: "Comment not found" }, 404);
      }
      if (result.error === DELETE_COMMENT_FORBIDDEN) {
        return c.json({ error: "You can only delete your own comments" }, 403);
      }
      return c.json({ error: "Failed to delete comment" }, 500);
    }

    return c.body(null, 204);
  },
);
