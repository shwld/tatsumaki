import type { Result } from "neverthrow";
import type { ProjectCreationRequest } from "../entities/project-creation-request";
import type { Project } from "../entities/project";

export const PROJECT_CREATION_REQUEST_REPOSITORY_ERROR =
  "PROJECT_CREATION_REQUEST_REPOSITORY_ERROR" as const;

export type ProjectCreationRequestRepositoryError =
  typeof PROJECT_CREATION_REQUEST_REPOSITORY_ERROR;

export type OpenProjectCreationRequestInput = {
  projectId: string;
  checkoutRequestId: string;
  purchaserUserId: string;
  name: string;
  idempotencyKey: string;
};

export interface ProjectCreationRequestRepository {
  // 同じ (purchaserUserId, idempotencyKey) は最初の要求をそのまま返す。
  open(
    input: OpenProjectCreationRequestInput,
  ): Promise<
    Result<ProjectCreationRequest, ProjectCreationRequestRepositoryError>
  >;
  findById(
    projectId: string,
  ): Promise<
    Result<ProjectCreationRequest | null, ProjectCreationRequestRepositoryError>
  >;
  // プロジェクト本体・オーナー行・要求の完了印を 1 バッチで確定する。何度呼んでも 1 度だけ作る。
  materialize(
    request: ProjectCreationRequest,
  ): Promise<Result<Project, ProjectCreationRequestRepositoryError>>;
}
