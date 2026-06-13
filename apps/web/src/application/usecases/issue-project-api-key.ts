import { err, ok, type Result } from "neverthrow";
import { hashApiKey } from "../services/api-key-hasher";
import {
  isValidApiKeyScope,
  type ApiKeyScope,
  type ProjectApiKey,
} from "../../domain/entities/project-api-key";
import type {
  ProjectApiKeyRepository,
  ProjectApiKeyRepositoryError,
} from "../../domain/repositories/project-api-key-repository";

export const API_KEY_NAME_REQUIRED_ERROR =
  "API_KEY_NAME_REQUIRED_ERROR" as const;
export const API_KEY_INVALID_SCOPE_ERROR =
  "API_KEY_INVALID_SCOPE_ERROR" as const;

export type IssueProjectApiKeyError =
  | typeof API_KEY_NAME_REQUIRED_ERROR
  | typeof API_KEY_INVALID_SCOPE_ERROR
  | ProjectApiKeyRepositoryError;

export type IssueProjectApiKeyResult = {
  apiKey: ProjectApiKey;
  rawKey: string;
};

async function generateApiKey(): Promise<{
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
}> {
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawHex = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const rawKey = `sk_${rawHex}`;
  const keyPrefix = rawKey.slice(0, 10);
  const keyHash = await hashApiKey(rawKey);
  return { rawKey, keyHash, keyPrefix };
}

export async function issueProjectApiKey(
  repository: ProjectApiKeyRepository,
  input: {
    projectId: string;
    name: string;
    scopes: string[];
    ownerUserId: string;
  },
): Promise<Result<IssueProjectApiKeyResult, IssueProjectApiKeyError>> {
  if (!input.name.trim()) {
    return err(API_KEY_NAME_REQUIRED_ERROR);
  }

  const validScopes: ApiKeyScope[] = input.scopes.filter(isValidApiKeyScope);
  if (validScopes.length === 0 || validScopes.length !== input.scopes.length) {
    return err(API_KEY_INVALID_SCOPE_ERROR);
  }

  const { rawKey, keyHash, keyPrefix } = await generateApiKey();

  const result = await repository.create({
    projectId: input.projectId,
    name: input.name.trim(),
    keyHash,
    keyPrefix,
    scopes: validScopes,
    ownerUserId: input.ownerUserId,
  });

  if (result.isErr()) {
    return err(result.error);
  }

  return ok({ apiKey: result.value, rawKey });
}
