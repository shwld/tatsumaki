import { err, type Result } from "neverthrow";
import type {
  Story,
  StoryStatus,
  StoryType,
} from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";
import {
  INVALID_STORY_STATUS_ERROR,
  INVALID_STORY_TYPE_ERROR,
  normalizeStoryStatus,
  normalizeStoryType,
} from "./story-input";

export type ListStoriesError =
  | StoryRepositoryError
  | typeof INVALID_STORY_STATUS_ERROR
  | typeof INVALID_STORY_TYPE_ERROR;

export async function listStories(
  repository: StoryRepository,
  input: {
    projectId: string;
    query?: string;
    status?: string;
    statuses?: string[];
    types?: string[];
    ownerId?: string;
    ownerIds?: string[];
    requesterId?: string;
    label?: string;
    labels?: string[];
    epicId?: string;
    epicIds?: string[];
    isIcebox?: boolean;
    iterationId?: string;
    excludeIterationId?: string;
    iterationDateScope?: "past" | "current" | "future";
    includeUnassignedIteration?: boolean;
    limit?: number;
    offset?: number;
    order?:
      | "positionAsc"
      | "statusChangedAtAsc"
      | "statusChangedAtDesc"
      | "currentAcceptedFirst";
    detailLevel?: "full" | "summary";
  },
): Promise<Result<Story[], ListStoriesError>> {
  let normalizedStatus: StoryStatus | undefined;
  let normalizedStatuses: StoryStatus[] | undefined;
  let normalizedTypes: StoryType[] | undefined;

  if (input?.status !== undefined) {
    const result = normalizeStoryStatus(input.status);
    if (result.isErr()) {
      return err(result.error);
    }
    normalizedStatus = result.value;
  }

  if (Array.isArray(input?.statuses) && input.statuses.length > 0) {
    const unique = new Set<StoryStatus>();
    for (const rawStatus of input.statuses) {
      const result = normalizeStoryStatus(rawStatus);
      if (result.isErr()) {
        return err(result.error);
      }
      unique.add(result.value);
    }
    normalizedStatuses = Array.from(unique);
  }

  if (Array.isArray(input?.types) && input.types.length > 0) {
    const unique = new Set<StoryType>();
    for (const rawType of input.types) {
      const result = normalizeStoryType(rawType);
      if (result.isErr()) {
        return err(result.error);
      }
      unique.add(result.value);
    }
    normalizedTypes = Array.from(unique);
  }

  return repository.list({
    projectId: input.projectId,
    ...(input.query ? { query: input.query } : {}),
    ...(normalizedStatus !== undefined ? { status: normalizedStatus } : {}),
    ...(normalizedStatuses !== undefined
      ? { statuses: normalizedStatuses }
      : {}),
    ...(normalizedTypes !== undefined ? { types: normalizedTypes } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    ...(Array.isArray(input.ownerIds) && input.ownerIds.length > 0
      ? { ownerIds: input.ownerIds }
      : {}),
    ...(input.requesterId ? { requesterId: input.requesterId } : {}),
    ...(input.label ? { label: input.label } : {}),
    ...(Array.isArray(input.labels) && input.labels.length > 0
      ? { labels: input.labels }
      : {}),
    ...(input.epicId ? { epicId: input.epicId } : {}),
    ...(Array.isArray(input.epicIds) && input.epicIds.length > 0
      ? { epicIds: input.epicIds }
      : {}),
    ...(input.isIcebox !== undefined ? { isIcebox: input.isIcebox } : {}),
    ...(input.iterationId ? { iterationId: input.iterationId } : {}),
    ...(input.excludeIterationId
      ? { excludeIterationId: input.excludeIterationId }
      : {}),
    ...(input.iterationDateScope
      ? { iterationDateScope: input.iterationDateScope }
      : {}),
    ...(input.includeUnassignedIteration !== undefined
      ? { includeUnassignedIteration: input.includeUnassignedIteration }
      : {}),
    ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    ...(typeof input.offset === "number" ? { offset: input.offset } : {}),
    ...(input.order ? { order: input.order } : {}),
    ...(input.detailLevel ? { detailLevel: input.detailLevel } : {}),
  });
}
