import { err, type Result } from "neverthrow";
import type { Epic } from "../../domain/entities/epic";
import type {
  EpicRepository,
  EpicRepositoryError,
} from "../../domain/repositories/epic-repository";
import {
  INVALID_EPIC_DESCRIPTION_ERROR,
  INVALID_EPIC_NAME_ERROR,
  normalizeEpicDescription,
  normalizeEpicName,
} from "./epic-input";

export type ManageEpicError =
  | EpicRepositoryError
  | typeof INVALID_EPIC_NAME_ERROR
  | typeof INVALID_EPIC_DESCRIPTION_ERROR;

export async function createEpic(
  repository: EpicRepository,
  input: {
    projectId: string;
    name: string;
    description?: string;
  },
): Promise<Result<Epic, ManageEpicError>> {
  const nameResult = normalizeEpicName(input.name);
  if (nameResult.isErr()) {
    return err(nameResult.error);
  }

  const descriptionResult = normalizeEpicDescription(input.description ?? "");
  if (descriptionResult.isErr()) {
    return err(descriptionResult.error);
  }

  return repository.create({
    projectId: input.projectId,
    name: nameResult.value,
    description: descriptionResult.value,
  });
}

export async function updateEpic(
  repository: EpicRepository,
  input: {
    projectId: string;
    id: string;
    name?: string;
    description?: string;
  },
): Promise<Result<Epic | null, ManageEpicError>> {
  let normalizedName: string | undefined;
  let normalizedDescription: string | undefined;

  if (input.name !== undefined) {
    const nameResult = normalizeEpicName(input.name);
    if (nameResult.isErr()) {
      return err(nameResult.error);
    }
    normalizedName = nameResult.value;
  }

  if (input.description !== undefined) {
    const descriptionResult = normalizeEpicDescription(input.description);
    if (descriptionResult.isErr()) {
      return err(descriptionResult.error);
    }
    normalizedDescription = descriptionResult.value;
  }

  return repository.update({
    projectId: input.projectId,
    id: input.id,
    ...(normalizedName !== undefined ? { name: normalizedName } : {}),
    ...(normalizedDescription !== undefined
      ? { description: normalizedDescription }
      : {}),
  });
}

export async function deleteEpic(
  repository: EpicRepository,
  projectId: string,
  id: string,
): Promise<Result<boolean, EpicRepositoryError>> {
  return repository.delete(projectId, id);
}

export async function listEpics(
  repository: EpicRepository,
  projectId: string,
): Promise<Result<Epic[], EpicRepositoryError>> {
  return repository.list(projectId);
}
