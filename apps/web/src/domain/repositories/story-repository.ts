import type { Result } from "neverthrow";
import type {
  Story,
  StoryPoint,
  StoryPriorityHistory,
  StoryStatus,
  StoryType,
} from "../entities/story";

export type CreateStoryInput = {
  projectId: string;
  title: string;
  description: string;
  type: StoryType;
  status: StoryStatus;
  storyPoint: StoryPoint | null;
  labels: string[];
  epicId: string | null;
  isIcebox: boolean;
  ownerIds: string[];
  requesterId: string | null;
  releaseDate?: string | null;
};

export type UpdateStoryInput = {
  projectId: string;
  id: string;
  title?: string;
  description?: string;
  type?: StoryType;
  status?: StoryStatus;
  storyPoint?: StoryPoint | null;
  labels?: string[];
  epicId?: string | null;
  isIcebox?: boolean;
  ownerIds?: string[];
  requesterId?: string | null;
  releaseDate?: string | null;
};

export type ReorderStoriesInput = {
  projectId: string;
  /** Subset of story IDs in desired order. Only these stories are repositioned; others retain their positions. */
  orderedIds: string[];
};
export type ReassignStoriesAcrossIterationsInput = {
  projectId: string;
  fromIterationId: string;
  toIterationId: string;
  statuses: StoryStatus[];
};

export type ListStoriesInput = {
  projectId: string;
  query?: string;
  status?: StoryStatus;
  statuses?: StoryStatus[];
  types?: StoryType[];
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
};

export type ListStoriesSummary = {
  total: number;
  totalPoints: number;
  pointsByIterationId: Record<string, number>;
};

/** Accepted stories only; used when rebuilding iterations after sprint calendar changes. */
export type AcceptedStoryIterationAnchor = {
  id: string;
  completedAt: string | null;
  statusChangedAt: string;
};

export const STORY_REPOSITORY_ERROR = "STORY_REPOSITORY_ERROR" as const;
export const STORY_OWNER_NOT_PROJECT_MEMBER_ERROR =
  "STORY_OWNER_NOT_PROJECT_MEMBER_ERROR" as const;
export const STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR =
  "STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR" as const;
export const STORY_EPIC_NOT_FOUND_ERROR = "STORY_EPIC_NOT_FOUND_ERROR" as const;

export type StoryRepositoryError =
  | typeof STORY_REPOSITORY_ERROR
  | typeof STORY_OWNER_NOT_PROJECT_MEMBER_ERROR
  | typeof STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR
  | typeof STORY_EPIC_NOT_FOUND_ERROR;

export interface StoryRepository {
  create(input: CreateStoryInput): Promise<Result<Story, StoryRepositoryError>>;
  findById(
    projectId: string,
    id: string,
  ): Promise<Result<Story | null, StoryRepositoryError>>;
  findByStoryNumber(
    projectId: string,
    storyNumber: number,
  ): Promise<Result<Story | null, StoryRepositoryError>>;
  update(
    input: UpdateStoryInput,
  ): Promise<Result<Story | null, StoryRepositoryError>>;
  delete(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, StoryRepositoryError>>;
  list(input: ListStoriesInput): Promise<Result<Story[], StoryRepositoryError>>;
  summarize(
    input: ListStoriesInput,
  ): Promise<Result<ListStoriesSummary, StoryRepositoryError>>;
  reorder(
    input: ReorderStoriesInput,
  ): Promise<Result<Story[] | null, StoryRepositoryError>>;
  reassignStoriesAcrossIterations(
    input: ReassignStoriesAcrossIterationsInput,
  ): Promise<Result<number, StoryRepositoryError>>;
  listPriorityHistory(
    projectId: string,
  ): Promise<Result<StoryPriorityHistory[], StoryRepositoryError>>;
  addBlocker(
    blockingStoryId: string,
    blockedStoryId: string,
  ): Promise<Result<void, StoryRepositoryError>>;
  removeBlocker(
    blockingStoryId: string,
    blockedStoryId: string,
  ): Promise<Result<boolean, StoryRepositoryError>>;
  listByOwnerAcrossProjects(
    userId: string,
    projectIds: string[],
  ): Promise<Result<Story[], StoryRepositoryError>>;
  listAcceptedForIterationRebuild(
    projectId: string,
  ): Promise<Result<AcceptedStoryIterationAnchor[], StoryRepositoryError>>;
}
