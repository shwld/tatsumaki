import type { Result } from "neverthrow";
import type { SavedFilter } from "../../domain/entities/saved-filter";
import type {
  SavedFilterRepository,
  SavedFilterRepositoryError,
} from "../../domain/repositories/saved-filter-repository";

export async function listSavedFilters(
  repository: SavedFilterRepository,
  input: {
    projectId: string;
    userId: string;
  },
): Promise<Result<SavedFilter[], SavedFilterRepositoryError>> {
  return repository.list({
    projectId: input.projectId,
    userId: input.userId,
  });
}
