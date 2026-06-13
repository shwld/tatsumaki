import { err, type Result } from "neverthrow";
import type {
  SavedFilter,
  SavedFilterConditions,
  SavedFilterVisibility,
} from "../../domain/entities/saved-filter";
import type {
  SavedFilterRepository,
  SavedFilterRepositoryError,
} from "../../domain/repositories/saved-filter-repository";

export const INVALID_SAVED_FILTER_NAME_ERROR =
  "INVALID_SAVED_FILTER_NAME_ERROR" as const;
export const INVALID_SAVED_FILTER_CONDITIONS_ERROR =
  "INVALID_SAVED_FILTER_CONDITIONS_ERROR" as const;

export type CreateSavedFilterError =
  | SavedFilterRepositoryError
  | typeof INVALID_SAVED_FILTER_NAME_ERROR
  | typeof INVALID_SAVED_FILTER_CONDITIONS_ERROR;

export async function createSavedFilter(
  repository: SavedFilterRepository,
  input: {
    projectId: string;
    ownerUserId: string;
    name: string;
    filters: SavedFilterConditions;
    visibility?: SavedFilterVisibility;
  },
): Promise<Result<SavedFilter, CreateSavedFilterError>> {
  const name = input.name.trim();
  if (!name) {
    return err(INVALID_SAVED_FILTER_NAME_ERROR);
  }

  const hasCondition =
    input.filters.query ||
    (input.filters.types && input.filters.types.length > 0) ||
    input.filters.unestimatedOnly === true ||
    (input.filters.statuses && input.filters.statuses.length > 0) ||
    (input.filters.ownerIds && input.filters.ownerIds.length > 0) ||
    (input.filters.labels && input.filters.labels.length > 0) ||
    (input.filters.epicIds && input.filters.epicIds.length > 0);

  if (!hasCondition) {
    return err(INVALID_SAVED_FILTER_CONDITIONS_ERROR);
  }

  return repository.create({
    projectId: input.projectId,
    ownerUserId: input.ownerUserId,
    name,
    filters: input.filters,
    visibility: input.visibility ?? "private",
  });
}
