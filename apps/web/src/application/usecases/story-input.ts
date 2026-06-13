import { err, ok, type Result } from "neverthrow";
import {
  STORY_STATUSES,
  STORY_TYPES,
  type StoryPoint,
  type StoryStatus,
  type StoryType,
} from "../../domain/entities/story";

export const INVALID_STORY_TITLE_ERROR = "INVALID_STORY_TITLE_ERROR" as const;
export const INVALID_STORY_TYPE_ERROR = "INVALID_STORY_TYPE_ERROR" as const;
export const INVALID_STORY_STATUS_ERROR = "INVALID_STORY_STATUS_ERROR" as const;
export const INVALID_STORY_LABELS_ERROR = "INVALID_STORY_LABELS_ERROR" as const;
export const INVALID_STORY_POINT_ERROR = "INVALID_STORY_POINT_ERROR" as const;
export const INVALID_STORY_OWNER_IDS_ERROR =
  "INVALID_STORY_OWNER_IDS_ERROR" as const;
export const INVALID_STORY_REQUESTER_ID_ERROR =
  "INVALID_STORY_REQUESTER_ID_ERROR" as const;
export const INVALID_STORY_EPIC_ID_ERROR =
  "INVALID_STORY_EPIC_ID_ERROR" as const;
export const INVALID_STORY_IS_ICEBOX_ERROR =
  "INVALID_STORY_IS_ICEBOX_ERROR" as const;

export type StoryInputValidationError =
  | typeof INVALID_STORY_TITLE_ERROR
  | typeof INVALID_STORY_TYPE_ERROR
  | typeof INVALID_STORY_STATUS_ERROR
  | typeof INVALID_STORY_LABELS_ERROR
  | typeof INVALID_STORY_POINT_ERROR
  | typeof INVALID_STORY_OWNER_IDS_ERROR
  | typeof INVALID_STORY_REQUESTER_ID_ERROR
  | typeof INVALID_STORY_EPIC_ID_ERROR
  | typeof INVALID_STORY_IS_ICEBOX_ERROR;

export function normalizeStoryTitle(
  title: string,
): Result<string, typeof INVALID_STORY_TITLE_ERROR> {
  const normalized = title.trim();

  if (!normalized) {
    return err(INVALID_STORY_TITLE_ERROR);
  }

  return ok(normalized);
}

/** description は任意（空文字列許容）。trim のみ行う。 */
export function normalizeStoryDescription(description: string): string {
  return description.trim();
}

export function normalizeStoryType(
  type: string,
): Result<StoryType, typeof INVALID_STORY_TYPE_ERROR> {
  if (!STORY_TYPES.includes(type as StoryType)) {
    return err(INVALID_STORY_TYPE_ERROR);
  }

  return ok(type as StoryType);
}

export function normalizeStoryStatus(
  status: string,
): Result<StoryStatus, typeof INVALID_STORY_STATUS_ERROR> {
  if (!STORY_STATUSES.includes(status as StoryStatus)) {
    return err(INVALID_STORY_STATUS_ERROR);
  }

  return ok(status as StoryStatus);
}

export function normalizeStoryLabels(
  labels: string[],
): Result<string[], typeof INVALID_STORY_LABELS_ERROR> {
  const normalizedLabels = labels.map((label) => {
    return label.trim();
  });

  if (
    normalizedLabels.some((label) => {
      return !label;
    })
  ) {
    return err(INVALID_STORY_LABELS_ERROR);
  }

  return ok(normalizedLabels);
}

export function normalizeStoryPoint(
  point: number | null,
  allowedPoints?: number[],
): Result<StoryPoint | null, typeof INVALID_STORY_POINT_ERROR> {
  if (point === null) {
    return ok(null);
  }

  if (!Number.isInteger(point)) {
    return err(INVALID_STORY_POINT_ERROR);
  }

  if (allowedPoints) {
    if (!allowedPoints.includes(point)) {
      return err(INVALID_STORY_POINT_ERROR);
    }
  }

  return ok(point as StoryPoint);
}

export function normalizeStoryOwnerIds(
  ownerIds: string[],
): Result<string[], typeof INVALID_STORY_OWNER_IDS_ERROR> {
  const normalized = ownerIds.map((ownerId) => {
    return ownerId.trim();
  });

  if (normalized.some((ownerId) => ownerId.length === 0)) {
    return err(INVALID_STORY_OWNER_IDS_ERROR);
  }

  return ok(Array.from(new Set(normalized)));
}

export function normalizeStoryRequesterId(
  requesterId: string | null,
): Result<string | null, typeof INVALID_STORY_REQUESTER_ID_ERROR> {
  if (requesterId === null) {
    return ok(null);
  }

  const normalized = requesterId.trim();
  if (!normalized) {
    return err(INVALID_STORY_REQUESTER_ID_ERROR);
  }

  return ok(normalized);
}

/**
 * Domain invariant: isIcebox=true requires iterationId=null and status!=Accepted.
 * A story in the Icebox cannot be assigned to an iteration or already accepted.
 */
export function normalizeStoryIsIcebox(
  isIcebox: boolean,
  context?: { iterationId: string | null; status: string },
): Result<boolean, typeof INVALID_STORY_IS_ICEBOX_ERROR> {
  if (isIcebox && context) {
    if (context.iterationId != null) {
      return err(INVALID_STORY_IS_ICEBOX_ERROR);
    }
    if (context.status === "Accepted") {
      return err(INVALID_STORY_IS_ICEBOX_ERROR);
    }
  }
  return ok(isIcebox);
}

export function normalizeStoryEpicId(
  epicId: string | null,
): Result<string | null, typeof INVALID_STORY_EPIC_ID_ERROR> {
  if (epicId === null) {
    return ok(null);
  }

  const normalized = epicId.trim();
  if (!normalized) {
    return err(INVALID_STORY_EPIC_ID_ERROR);
  }

  return ok(normalized);
}
