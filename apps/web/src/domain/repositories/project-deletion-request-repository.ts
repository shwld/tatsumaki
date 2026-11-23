import type { Result } from "neverthrow";

export const PROJECT_DELETION_REQUEST_REPOSITORY_ERROR =
  "PROJECT_DELETION_REQUEST_REPOSITORY_ERROR" as const;

export type ProjectDeletionRequestRepositoryError =
  typeof PROJECT_DELETION_REQUEST_REPOSITORY_ERROR;

export type ProjectDeletionRequest = {
  projectId: string;
  requestedByUserId: string;
  attemptCount: number;
};

export interface ProjectDeletionRequestRepository {
  // 同じ projectId は最初の要求をそのまま残す。要求者が今も owner のときだけ保存し、
  // 所有権の切替で降格済みなら保存せず false を返す(権限の確認と保存を同じ書き込みで行う)。
  open(input: {
    projectId: string;
    requestedByUserId: string;
  }): Promise<Result<boolean, ProjectDeletionRequestRepositoryError>>;
  findById(
    projectId: string,
  ): Promise<
    Result<ProjectDeletionRequest | null, ProjectDeletionRequestRepositoryError>
  >;
  // 未完了の要求を、最後に試行した時刻の古い順に limit 件返す。
  listPending(
    limit: number,
  ): Promise<
    Result<ProjectDeletionRequest[], ProjectDeletionRequestRepositoryError>
  >;
  recordFailure(
    projectId: string,
    error: string,
  ): Promise<Result<void, ProjectDeletionRequestRepositoryError>>;
  // 何度呼んでもよい。
  complete(
    projectId: string,
  ): Promise<Result<void, ProjectDeletionRequestRepositoryError>>;
}
