import { err, ok, type Result } from "neverthrow";
import type { ProjectApiKey } from "../../domain/entities/project-api-key";
import type {
  ProjectApiKeyRepository,
  ProjectApiKeyRepositoryError,
} from "../../domain/repositories/project-api-key-repository";

export const API_KEY_NOT_FOUND_ERROR = "API_KEY_NOT_FOUND_ERROR" as const;
export const API_KEY_PROJECT_MISMATCH_ERROR =
  "API_KEY_PROJECT_MISMATCH_ERROR" as const;

export type RevokeProjectApiKeyError =
  | typeof API_KEY_NOT_FOUND_ERROR
  | typeof API_KEY_PROJECT_MISMATCH_ERROR
  | ProjectApiKeyRepositoryError;

export async function revokeProjectApiKey(
  repository: ProjectApiKeyRepository,
  input: {
    projectId: string;
    keyId: string;
  },
): Promise<Result<ProjectApiKey, RevokeProjectApiKeyError>> {
  const findResult = await repository.findById(input.keyId);
  if (findResult.isErr()) {
    return err(findResult.error);
  }

  const apiKey = findResult.value;
  if (!apiKey) {
    return err(API_KEY_NOT_FOUND_ERROR);
  }

  if (apiKey.projectId !== input.projectId) {
    return err(API_KEY_PROJECT_MISMATCH_ERROR);
  }

  const revokedAt = new Date().toISOString();
  const revokeResult = await repository.revoke(input.keyId, revokedAt);
  if (revokeResult.isErr()) {
    return err(revokeResult.error);
  }

  if (!revokeResult.value) {
    return err(API_KEY_NOT_FOUND_ERROR);
  }

  return ok(revokeResult.value);
}
