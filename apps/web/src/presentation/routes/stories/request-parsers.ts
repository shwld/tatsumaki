type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; message: string };

type ParseResult<T> = ParseOk<T> | ParseErr;

export type CreateStoryRequest = {
  title: string;
  description: string;
  type: string;
  status: string;
  storyPoint: number | null;
  labels: string[];
  epicId: string | null;
  panel: "icebox" | "backlog" | "current";
  isIcebox: boolean;
  ownerIds: string[];
  requesterId: string | null;
  releaseDate?: string | null;
};

export type UpdateStoryRequest = {
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  storyPoint?: number | null;
  labels?: string[];
  epicId?: string | null;
  isIcebox?: boolean;
  ownerIds?: string[];
  requesterId?: string | null;
  releaseDate?: string | null;
};

export type ReorderStoriesRequest = {
  orderedIds: string[];
};

export type StoryBlockerRequest = {
  relation: "blockedBy" | "blocks";
  targetStoryId: string;
};

export type BulkUpdateStoryStatusRequest = {
  storyIds: string[];
  status: string;
};

export type BulkAddStoryLabelsRequest = {
  storyIds: string[];
  labels: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => {
      return typeof entry === "string" && entry.length > 0;
    })
  );
}

export function parseCreateStoryRequest(
  body: unknown,
): ParseResult<CreateStoryRequest> {
  if (!isRecord(body)) {
    return { ok: false, message: "Invalid JSON body" };
  }

  if (typeof body.title !== "string") {
    return { ok: false, message: "Story title is required" };
  }

  if (body.description !== undefined && typeof body.description !== "string") {
    return { ok: false, message: "Story description must be a string" };
  }

  if (body.type !== undefined && typeof body.type !== "string") {
    return { ok: false, message: "Story type must be a string" };
  }

  if (body.status !== undefined && typeof body.status !== "string") {
    return { ok: false, message: "Story status must be a string" };
  }

  if (
    body.storyPoint !== undefined &&
    body.storyPoint !== null &&
    typeof body.storyPoint !== "number"
  ) {
    return { ok: false, message: "Story point must be a number or null" };
  }

  if (
    body.labels !== undefined &&
    (!Array.isArray(body.labels) ||
      body.labels.some((label) => {
        return typeof label !== "string";
      }))
  ) {
    return { ok: false, message: "Story labels must be an array of strings" };
  }

  if (
    body.panel !== undefined &&
    body.panel !== "icebox" &&
    body.panel !== "backlog" &&
    body.panel !== "current"
  ) {
    return {
      ok: false,
      message: "panel must be one of icebox, backlog, or current",
    };
  }

  if (
    body.epicId !== undefined &&
    body.epicId !== null &&
    typeof body.epicId !== "string"
  ) {
    return { ok: false, message: "Story epicId must be a string or null" };
  }

  if (body.isIcebox !== undefined && typeof body.isIcebox !== "boolean") {
    return { ok: false, message: "isIcebox must be a boolean" };
  }

  if (
    body.ownerIds !== undefined &&
    (!Array.isArray(body.ownerIds) ||
      body.ownerIds.some((ownerId) => {
        return typeof ownerId !== "string";
      }))
  ) {
    return { ok: false, message: "Story owners must be an array of user IDs" };
  }

  if (
    body.requesterId !== undefined &&
    body.requesterId !== null &&
    typeof body.requesterId !== "string"
  ) {
    return { ok: false, message: "Requester must be a user ID or null" };
  }

  if (
    body.releaseDate !== undefined &&
    body.releaseDate !== null &&
    (typeof body.releaseDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.releaseDate))
  ) {
    return {
      ok: false,
      message: "releaseDate must be a date string (YYYY-MM-DD) or null",
    };
  }

  return {
    ok: true,
    value: {
      panel:
        body.panel === "icebox" ||
        body.panel === "backlog" ||
        body.panel === "current"
          ? body.panel
          : body.isIcebox === true
            ? "icebox"
            : "backlog",
      title: body.title,
      description: typeof body.description === "string" ? body.description : "",
      type: typeof body.type === "string" ? body.type : "feature",
      status: typeof body.status === "string" ? body.status : "Unstarted",
      storyPoint:
        typeof body.storyPoint === "number" || body.storyPoint === null
          ? body.storyPoint
          : null,
      labels: Array.isArray(body.labels) ? (body.labels as string[]) : [],
      epicId:
        typeof body.epicId === "string" || body.epicId === null
          ? body.epicId
          : null,
      isIcebox:
        body.panel === "icebox"
          ? true
          : body.panel === "backlog" || body.panel === "current"
            ? false
            : body.isIcebox === true,
      ownerIds: Array.isArray(body.ownerIds) ? (body.ownerIds as string[]) : [],
      requesterId:
        typeof body.requesterId === "string" || body.requesterId === null
          ? body.requesterId
          : null,
      releaseDate:
        typeof body.releaseDate === "string" || body.releaseDate === null
          ? (body.releaseDate as string | null)
          : undefined,
    },
  };
}

export function parseUpdateStoryRequest(
  body: unknown,
): ParseResult<UpdateStoryRequest> {
  if (!isRecord(body)) {
    return { ok: false, message: "Invalid JSON body" };
  }

  if (body.title !== undefined && typeof body.title !== "string") {
    return { ok: false, message: "Story title must be a string" };
  }

  if (body.description !== undefined && typeof body.description !== "string") {
    return { ok: false, message: "Story description must be a string" };
  }

  if (body.type !== undefined && typeof body.type !== "string") {
    return { ok: false, message: "Story type must be a string" };
  }

  if (body.status !== undefined && typeof body.status !== "string") {
    return { ok: false, message: "Story status must be a string" };
  }

  if (
    body.storyPoint !== undefined &&
    body.storyPoint !== null &&
    typeof body.storyPoint !== "number"
  ) {
    return { ok: false, message: "Story point must be a number or null" };
  }

  if (
    body.labels !== undefined &&
    (!Array.isArray(body.labels) ||
      body.labels.some((label) => {
        return typeof label !== "string";
      }))
  ) {
    return { ok: false, message: "Story labels must be an array of strings" };
  }

  if (
    body.epicId !== undefined &&
    body.epicId !== null &&
    typeof body.epicId !== "string"
  ) {
    return { ok: false, message: "Story epicId must be a string or null" };
  }

  if (body.isIcebox !== undefined && typeof body.isIcebox !== "boolean") {
    return { ok: false, message: "isIcebox must be a boolean" };
  }

  if (
    body.ownerIds !== undefined &&
    (!Array.isArray(body.ownerIds) ||
      body.ownerIds.some((ownerId) => {
        return typeof ownerId !== "string";
      }))
  ) {
    return { ok: false, message: "Story owners must be an array of user IDs" };
  }

  if (
    body.requesterId !== undefined &&
    body.requesterId !== null &&
    typeof body.requesterId !== "string"
  ) {
    return { ok: false, message: "Requester must be a user ID or null" };
  }

  if (
    body.releaseDate !== undefined &&
    body.releaseDate !== null &&
    (typeof body.releaseDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.releaseDate))
  ) {
    return {
      ok: false,
      message: "releaseDate must be a date string (YYYY-MM-DD) or null",
    };
  }

  return {
    ok: true,
    value: {
      ...(body.title !== undefined ? { title: body.title as string } : {}),
      ...(body.description !== undefined
        ? { description: body.description as string }
        : {}),
      ...(body.type !== undefined ? { type: body.type as string } : {}),
      ...(body.status !== undefined ? { status: body.status as string } : {}),
      ...(body.storyPoint !== undefined
        ? { storyPoint: body.storyPoint as number | null }
        : {}),
      ...(body.labels !== undefined ? { labels: body.labels as string[] } : {}),
      ...(body.epicId !== undefined
        ? { epicId: body.epicId as string | null }
        : {}),
      ...(body.isIcebox !== undefined
        ? { isIcebox: body.isIcebox as boolean }
        : {}),
      ...(body.ownerIds !== undefined
        ? { ownerIds: body.ownerIds as string[] }
        : {}),
      ...(body.requesterId !== undefined
        ? { requesterId: body.requesterId as string | null }
        : {}),
      ...(body.releaseDate !== undefined
        ? { releaseDate: body.releaseDate as string | null }
        : {}),
    },
  };
}

export function parseReorderStoriesRequest(
  body: unknown,
): ParseResult<ReorderStoriesRequest> {
  if (!isRecord(body)) {
    return { ok: false, message: "Invalid JSON body" };
  }

  if (
    !Array.isArray(body.orderedIds) ||
    body.orderedIds.some((storyId) => {
      return typeof storyId !== "string";
    })
  ) {
    return { ok: false, message: "orderedIds must be an array of story IDs" };
  }

  return {
    ok: true,
    value: { orderedIds: body.orderedIds as string[] },
  };
}

export function parseStoryBlockerRequest(
  body: unknown,
): ParseResult<StoryBlockerRequest> {
  if (!isRecord(body)) {
    return { ok: false, message: "Invalid JSON body" };
  }

  if (body.relation !== "blockedBy" && body.relation !== "blocks") {
    return {
      ok: false,
      message: "relation must be blockedBy or blocks",
    };
  }

  if (
    typeof body.targetStoryId !== "string" ||
    body.targetStoryId.length === 0
  ) {
    return {
      ok: false,
      message: "targetStoryId is required",
    };
  }

  return {
    ok: true,
    value: {
      relation: body.relation,
      targetStoryId: body.targetStoryId,
    },
  };
}

export function parseBulkUpdateStoryStatusRequest(
  body: unknown,
): ParseResult<BulkUpdateStoryStatusRequest> {
  if (!isRecord(body)) {
    return { ok: false, message: "Invalid JSON body" };
  }

  if (!isNonEmptyStringArray(body.storyIds)) {
    return { ok: false, message: "storyIds must be a non-empty string array" };
  }

  if (typeof body.status !== "string") {
    return { ok: false, message: "status must be a string" };
  }

  return {
    ok: true,
    value: {
      storyIds: body.storyIds,
      status: body.status,
    },
  };
}

export function parseBulkAddStoryLabelsRequest(
  body: unknown,
): ParseResult<BulkAddStoryLabelsRequest> {
  if (!isRecord(body)) {
    return { ok: false, message: "Invalid JSON body" };
  }

  if (!isNonEmptyStringArray(body.storyIds)) {
    return { ok: false, message: "storyIds must be a non-empty string array" };
  }

  if (!isNonEmptyStringArray(body.labels)) {
    return { ok: false, message: "labels must be a non-empty string array" };
  }

  return {
    ok: true,
    value: {
      storyIds: body.storyIds,
      labels: body.labels,
    },
  };
}
