import type { Result } from "neverthrow";
import type { ProjectApiKey } from "../../domain/entities/project-api-key";
import type {
  ProjectApiKeyRepository,
  ProjectApiKeyRepositoryError,
} from "../../domain/repositories/project-api-key-repository";

export type ListProjectApiKeysError = ProjectApiKeyRepositoryError;

export async function listProjectApiKeys(
  repository: ProjectApiKeyRepository,
  input: {
    projectId: string;
  },
): Promise<Result<ProjectApiKey[], ListProjectApiKeysError>> {
  return repository.listByProject(input.projectId);
}
