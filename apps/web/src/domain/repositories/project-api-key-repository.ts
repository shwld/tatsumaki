import type { Result } from "neverthrow";
import type { ApiKeyScope, ProjectApiKey } from "../entities/project-api-key";

export const PROJECT_API_KEY_REPOSITORY_ERROR =
  "PROJECT_API_KEY_REPOSITORY_ERROR" as const;

export type ProjectApiKeyRepositoryError =
  typeof PROJECT_API_KEY_REPOSITORY_ERROR;

export type CreateApiKeyInput = {
  projectId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  ownerUserId: string;
};

export interface ProjectApiKeyRepository {
  create(
    input: CreateApiKeyInput,
  ): Promise<Result<ProjectApiKey, ProjectApiKeyRepositoryError>>;

  listByProject(
    projectId: string,
  ): Promise<Result<ProjectApiKey[], ProjectApiKeyRepositoryError>>;

  findByHash(
    keyHash: string,
  ): Promise<Result<ProjectApiKey | null, ProjectApiKeyRepositoryError>>;

  findById(
    id: string,
  ): Promise<Result<ProjectApiKey | null, ProjectApiKeyRepositoryError>>;

  revoke(
    id: string,
    revokedAt: string,
  ): Promise<Result<ProjectApiKey | null, ProjectApiKeyRepositoryError>>;

  touchLastUsed(
    id: string,
    lastUsedAt: string,
  ): Promise<Result<void, ProjectApiKeyRepositoryError>>;
}
