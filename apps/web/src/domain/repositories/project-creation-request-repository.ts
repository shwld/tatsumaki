import type { Result } from "neverthrow";
import type {
  ProjectCreationRequest,
  ProjectCreationStalledReason,
} from "../entities/project-creation-request";
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

export type RecordCreationAttemptInput = {
  projectId: string;
  attemptCount: number;
  materializeFailureCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  stalledReason: ProjectCreationStalledReason | null;
};

export type ProjectCreationOutcome = {
  projectId: string;
  accountId: string;
  outcome: "created" | "failed";
  occurredAt: string;
};

export interface ProjectCreationRequestRepository {
  markFailed(
    projectId: string,
    now: string,
  ): Promise<Result<boolean, ProjectCreationRequestRepositoryError>>;
  listUnnotified(
    limit: number,
  ): Promise<
    Result<ProjectCreationOutcome[], ProjectCreationRequestRepositoryError>
  >;
  markNotificationAttempt(
    projectId: string,
  ): Promise<Result<void, ProjectCreationRequestRepositoryError>>;
  markNotified(
    projectId: string,
  ): Promise<Result<void, ProjectCreationRequestRepositoryError>>;

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
  // 自動復旧の対象(未完了・停止していない・次回試行時刻に達した)を古い順に limit 件返す。
  listRecoverable(
    now: string,
    limit: number,
  ): Promise<
    Result<ProjectCreationRequest[], ProjectCreationRequestRepositoryError>
  >;
  // 作成済みの要求は更新しない。
  recordAttempt(
    input: RecordCreationAttemptInput,
  ): Promise<Result<void, ProjectCreationRequestRepositoryError>>;
}
