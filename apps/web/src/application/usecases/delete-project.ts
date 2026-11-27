import { err, ok, type Result } from "neverthrow";
import type { ProjectDeletionRequestRepository } from "../../domain/repositories/project-deletion-request-repository";
import {
  PROJECT_REPOSITORY_ERROR,
  type ProjectRepository,
  type ProjectRepositoryError,
} from "../../domain/repositories/project-repository";
import type { ProjectDeletionNotificationGateway } from "../ports/project-deletion-notification-gateway";

export const PROJECT_NOT_FOUND_ERROR = "PROJECT_NOT_FOUND_ERROR" as const;
export const PROJECT_DELETE_FORBIDDEN_ERROR =
  "PROJECT_DELETE_FORBIDDEN_ERROR" as const;
export const PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR =
  "PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR" as const;
// 削除要求は保持済みだが未完了(通知の未確認、または本体削除の失敗)。定期復旧が完了させる。
export const PROJECT_DELETE_PENDING_ERROR =
  "PROJECT_DELETE_PENDING_ERROR" as const;

export type DeleteProjectError =
  | typeof PROJECT_NOT_FOUND_ERROR
  | typeof PROJECT_DELETE_FORBIDDEN_ERROR
  | typeof PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR
  | typeof PROJECT_DELETE_PENDING_ERROR
  | ProjectRepositoryError;

export type DeleteProjectDeps = {
  repository: ProjectRepository;
  notifications?: {
    requests: ProjectDeletionRequestRepository;
    gateway: ProjectDeletionNotificationGateway;
  };
};

const failureMessage = (error: unknown): string =>
  (error instanceof Error ? error.name : "unknown").slice(0, 200);

/**
 * 提供者への通知と DB 削除は 1 つのトランザクションにできないため、先に削除要求を永続化し、
 * 本体削除 → 結果通知 → 要求の完了印の順に進める。どこで途切れても要求が残り、
 * 再実行または定期復旧で同じ結果に収束する。
 */
async function deleteAndNotify(
  repository: ProjectRepository,
  notifications: NonNullable<DeleteProjectDeps["notifications"]>,
  projectId: string,
): Promise<Result<boolean, DeleteProjectError>> {
  let deleteResult: Awaited<ReturnType<ProjectRepository["delete"]>>;
  try {
    deleteResult = await repository.delete(projectId);
  } catch (error) {
    await notifications.requests.recordFailure(
      projectId,
      failureMessage(error),
    );
    return err(PROJECT_DELETE_PENDING_ERROR);
  }
  if (deleteResult.isErr()) {
    await notifications.requests.recordFailure(
      projectId,
      "project_delete_failed",
    );
    return err(PROJECT_DELETE_PENDING_ERROR);
  }
  try {
    await notifications.gateway.recordProjectDeleted({ projectId });
  } catch (error) {
    await notifications.requests.recordFailure(
      projectId,
      failureMessage(error),
    );
    return err(PROJECT_DELETE_PENDING_ERROR);
  }

  const completed = await notifications.requests.complete(projectId);
  if (completed.isErr()) {
    // 本体は削除済み。残った要求は復旧ジョブが完了させる。
    console.error("Failed to complete project deletion request", { projectId });
  }
  return ok(deleteResult.value);
}

export async function deleteProject(
  deps: DeleteProjectDeps,
  input: { projectId: string; userId: string; confirmProjectName: string },
): Promise<Result<true, DeleteProjectError>> {
  const projectResult = await deps.repository.findById(input.projectId);
  if (projectResult.isErr()) {
    return err(projectResult.error);
  }

  const project = projectResult.value;
  if (!project) {
    return err(PROJECT_NOT_FOUND_ERROR);
  }

  if (input.confirmProjectName !== project.name) {
    return err(PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR);
  }

  let deleted: Result<boolean, DeleteProjectError>;
  if (deps.notifications) {
    const opened = await deps.notifications.requests.open({
      projectId: input.projectId,
      requestedByUserId: input.userId,
    });
    if (opened.isErr()) {
      // 要求を残せていないので「受付済み」とは扱わない。
      return err(PROJECT_REPOSITORY_ERROR);
    }
    if (!opened.value) {
      // 並行する削除で本体が既に無い場合は、権限不足ではなく未検出として返す。
      const current = await deps.repository.findById(input.projectId);
      if (current.isOk() && current.value === null) {
        return err(PROJECT_NOT_FOUND_ERROR);
      }
      return err(PROJECT_DELETE_FORBIDDEN_ERROR);
    }
    deleted = await deleteAndNotify(
      deps.repository,
      deps.notifications,
      input.projectId,
    );
  } else {
    deleted = await deps.repository.delete(input.projectId);
  }

  if (deleted.isErr()) {
    return err(deleted.error);
  }
  if (!deleted.value) {
    return err(PROJECT_NOT_FOUND_ERROR);
  }
  return ok(true);
}

export const DELETION_RECOVERY_BATCH_SIZE = 20;

export type RecoverProjectDeletionsSummary = {
  examined: number;
  completed: number;
  stillPending: number;
};

/**
 * Never throws。オーナーが確認名つきで受け付けた削除要求を、提供者に受理されるまで再試行する。
 * 本体が既に無い要求は完了印だけ付ける。
 */
export async function recoverProjectDeletions(
  deps: Required<Pick<DeleteProjectDeps, "notifications">> &
    Pick<DeleteProjectDeps, "repository">,
  input: { limit?: number } = {},
): Promise<RecoverProjectDeletionsSummary> {
  const summary: RecoverProjectDeletionsSummary = {
    examined: 0,
    completed: 0,
    stillPending: 0,
  };
  const listed = await deps.notifications.requests.listPending(
    input.limit ?? DELETION_RECOVERY_BATCH_SIZE,
  );
  if (listed.isErr()) {
    throw new Error("Failed to list pending project deletion requests");
  }

  for (const request of listed.value) {
    summary.examined += 1;
    try {
      const result = await deleteAndNotify(
        deps.repository,
        deps.notifications,
        request.projectId,
      );
      if (result.isErr()) {
        summary.stillPending += 1;
        continue;
      }
      summary.completed += 1;
    } catch (error) {
      // 1 件の例外でバッチ全体を止めない。要求は残り、次回再試行される。
      summary.stillPending += 1;
      console.error("Project deletion recovery attempt failed", {
        projectId: request.projectId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return summary;
}
