import type { Result } from "neverthrow";
import type { Epic } from "../entities/epic";

export type CreateEpicInput = {
  projectId: string;
  name: string;
  description: string;
};

export type UpdateEpicInput = {
  projectId: string;
  id: string;
  name?: string;
  description?: string;
};

export const EPIC_REPOSITORY_ERROR = "EPIC_REPOSITORY_ERROR" as const;
export const EPIC_DUPLICATE_NAME_ERROR = "EPIC_DUPLICATE_NAME_ERROR" as const;
export const EPIC_NOT_FOUND_ERROR = "EPIC_NOT_FOUND_ERROR" as const;

export type EpicRepositoryError =
  | typeof EPIC_REPOSITORY_ERROR
  | typeof EPIC_DUPLICATE_NAME_ERROR
  | typeof EPIC_NOT_FOUND_ERROR;

export interface EpicRepository {
  create(input: CreateEpicInput): Promise<Result<Epic, EpicRepositoryError>>;
  update(
    input: UpdateEpicInput,
  ): Promise<Result<Epic | null, EpicRepositoryError>>;
  delete(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, EpicRepositoryError>>;
  list(projectId: string): Promise<Result<Epic[], EpicRepositoryError>>;
  exists(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, EpicRepositoryError>>;
}
