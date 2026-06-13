import type { Result } from "neverthrow";
import type {
  SavedFilterRepository,
  SavedFilterRepositoryError,
} from "../../domain/repositories/saved-filter-repository";

export async function deleteSavedFilter(
  repository: SavedFilterRepository,
  input: {
    id: string;
    projectId: string;
    userId: string;
  },
): Promise<Result<boolean, SavedFilterRepositoryError>> {
  return repository.delete(input.id, input.projectId, input.userId);
}
