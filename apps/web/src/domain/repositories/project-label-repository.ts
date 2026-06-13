import type { Result } from "neverthrow";
import type { ProjectLabel } from "../entities/project-label";

export type CreateProjectLabelInput = {
  projectId: string;
  name: string;
  color: string;
};

export type UpdateProjectLabelInput = {
  id: string;
  projectId: string;
  name?: string;
  color?: string;
};

export const PROJECT_LABEL_REPOSITORY_ERROR =
  "PROJECT_LABEL_REPOSITORY_ERROR" as const;
export const PROJECT_LABEL_DUPLICATE_NAME_ERROR =
  "PROJECT_LABEL_DUPLICATE_NAME_ERROR" as const;

export type ProjectLabelRepositoryError =
  | typeof PROJECT_LABEL_REPOSITORY_ERROR
  | typeof PROJECT_LABEL_DUPLICATE_NAME_ERROR;

export interface ProjectLabelRepository {
  create(
    input: CreateProjectLabelInput,
  ): Promise<Result<ProjectLabel, ProjectLabelRepositoryError>>;
  findById(
    projectId: string,
    id: string,
  ): Promise<Result<ProjectLabel | null, ProjectLabelRepositoryError>>;
  update(
    input: UpdateProjectLabelInput,
  ): Promise<Result<ProjectLabel | null, ProjectLabelRepositoryError>>;
  delete(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, ProjectLabelRepositoryError>>;
  list(
    projectId: string,
  ): Promise<Result<ProjectLabel[], ProjectLabelRepositoryError>>;
}
