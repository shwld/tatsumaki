import type { Result } from "neverthrow";
import type { Iteration, IterationOverride } from "../entities/iteration";
import type { StoryStatus } from "../entities/story";
import type { STORY_ARCHIVED_ERROR } from "./story-repository";

export type CreateIterationInput = {
  projectId: string;
  startDate: string;
  endDate: string;
};

export type AssignStoryInput = {
  projectId: string;
  iterationId: string;
  storyId: string;
};

export type UnassignStoryInput = {
  projectId: string;
  storyId: string;
  /** When set, the assignment is cleared only while the story still has this status. */
  requiredStatus?: StoryStatus;
};

export type UpdateIterationUtilizationInput = {
  projectId: string;
  iterationNumber: number;
  sprintUtilizationPercent: number;
  iterationStartDate?: string | null;
  iterationEndDate?: string | null;
};

export const ITERATION_REPOSITORY_ERROR = "ITERATION_REPOSITORY_ERROR" as const;
export const ITERATION_NOT_FOUND_ERROR = "ITERATION_NOT_FOUND_ERROR" as const;
export const ITERATION_DATE_OVERLAP_ERROR =
  "ITERATION_DATE_OVERLAP_ERROR" as const;
export const ITERATION_STORY_STATUS_CONFLICT_ERROR =
  "ITERATION_STORY_STATUS_CONFLICT_ERROR" as const;

export type IterationRepositoryError =
  | typeof ITERATION_REPOSITORY_ERROR
  | typeof ITERATION_NOT_FOUND_ERROR
  | typeof ITERATION_DATE_OVERLAP_ERROR
  | typeof ITERATION_STORY_STATUS_CONFLICT_ERROR
  | typeof STORY_ARCHIVED_ERROR;

export interface IterationRepository {
  create(
    input: CreateIterationInput,
  ): Promise<Result<Iteration, IterationRepositoryError>>;
  list(
    projectId: string,
  ): Promise<Result<Iteration[], IterationRepositoryError>>;
  findById(
    projectId: string,
    id: string,
  ): Promise<Result<Iteration | null, IterationRepositoryError>>;
  delete(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, IterationRepositoryError>>;
  findLatest(
    projectId: string,
  ): Promise<Result<Iteration | null, IterationRepositoryError>>;
  deleteFuture(
    projectId: string,
    date: string,
  ): Promise<Result<number, IterationRepositoryError>>;
  deleteAll(
    projectId: string,
  ): Promise<Result<number, IterationRepositoryError>>;
  assignStory(
    input: AssignStoryInput,
  ): Promise<Result<boolean, IterationRepositoryError>>;
  /** Rebuild remaps archived stories too, so it bypasses the read-only guard. */
  assignStoryForRebuild(
    input: AssignStoryInput,
  ): Promise<Result<boolean, IterationRepositoryError>>;
  unassignStory(
    input: UnassignStoryInput,
  ): Promise<Result<boolean, IterationRepositoryError>>;
  updateUtilization(
    input: UpdateIterationUtilizationInput,
  ): Promise<Result<IterationOverride, IterationRepositoryError>>;
  deleteUtilizationOverride(input: {
    projectId: string;
    iterationNumber: number;
  }): Promise<Result<boolean, IterationRepositoryError>>;
  listOverrides(
    projectId: string,
  ): Promise<Result<IterationOverride[], IterationRepositoryError>>;
}
