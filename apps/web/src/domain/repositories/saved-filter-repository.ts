import type { Result } from "neverthrow";
import type {
  SavedFilter,
  SavedFilterConditions,
  SavedFilterVisibility,
} from "../entities/saved-filter";

export const SAVED_FILTER_REPOSITORY_ERROR =
  "SAVED_FILTER_REPOSITORY_ERROR" as const;
export const SAVED_FILTER_NOT_FOUND_ERROR =
  "SAVED_FILTER_NOT_FOUND_ERROR" as const;
export const SAVED_FILTER_FORBIDDEN_ERROR =
  "SAVED_FILTER_FORBIDDEN_ERROR" as const;

export type SavedFilterRepositoryError =
  | typeof SAVED_FILTER_REPOSITORY_ERROR
  | typeof SAVED_FILTER_NOT_FOUND_ERROR
  | typeof SAVED_FILTER_FORBIDDEN_ERROR;

export type CreateSavedFilterInput = {
  projectId: string;
  ownerUserId: string;
  name: string;
  filters: SavedFilterConditions;
  visibility?: SavedFilterVisibility;
};

export type ListSavedFiltersInput = {
  projectId: string;
  userId: string;
};

export interface SavedFilterRepository {
  create(
    input: CreateSavedFilterInput,
  ): Promise<Result<SavedFilter, SavedFilterRepositoryError>>;
  list(
    input: ListSavedFiltersInput,
  ): Promise<Result<SavedFilter[], SavedFilterRepositoryError>>;
  delete(
    id: string,
    projectId: string,
    userId: string,
  ): Promise<Result<boolean, SavedFilterRepositoryError>>;
}
