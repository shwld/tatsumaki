import { err, ok, type Result } from "neverthrow";
import type { ProjectDeletionRequestRepository } from "../../domain/repositories/project-deletion-request-repository";
import {
  PROJECT_REPOSITORY_ERROR,
  type ProjectRepository,
  type ProjectRepositoryError,
} from "../../domain/repositories/project-repository";
import type { ProjectBillingCloseGateway } from "../ports/project-billing-close-gateway";

export const PROJECT_NOT_FOUND_ERROR = "PROJECT_NOT_FOUND_ERROR" as const;
export const PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR =
  "PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR" as const;
// 課金の終了を確認できていない。削除要求は保持済みで、確認できるまで本体は消さない。
export const PROJECT_DELETE_BILLING_PENDING_ERROR =
  "PROJECT_DELETE_BILLING_PENDING_ERROR" as const;

export type DeleteProjectError =
  | typeof PROJECT_NOT_FOUND_ERROR
  | typeof PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR
  | typeof PROJECT_DELETE_BILLING_PENDING_ERROR
  | ProjectRepositoryError;

// 公式ホスト版のみ billing を渡す。セルフホストは課金 RPC なしで従来どおり削除する。
export type DeleteProjectDeps = {
  repository: ProjectRepository;
  billing?: {
    requests: ProjectDeletionRequestRepository;
    gateway: ProjectBillingCloseGateway;
  };
};

const failureMessage = (error: unknown): string =>
  (error instanceof Error ? error.name : "unknown").slice(0, 200);

/**
 * 課金の終了と DB 削除は 1 つのトランザクションにできないため、先に削除要求を永続化し、
 * 課金終了(冪等)→ 本体削除 → 要求の完了印の順に進める。どこで途切れても要求が残り、
 * 再実行または定期復旧で同じ結果に収束する。
 */
async function closeBillingAndDelete(
  repository: ProjectRepository,
  billing: NonNullable<DeleteProjectDeps["billing"]>,
  projectId: string,
): Promise<Result<boolean, DeleteProjectError>> {
  try {
    await billing.gateway.closeProjectBilling({ projectId });
  } catch (error) {
    await billing.requests.recordFailure(projectId, failureMessage(error));
    return err(PROJECT_DELETE_BILLING_PENDING_ERROR);
  }

  let deleteResult: Awaited<ReturnType<ProjectRepository["delete"]>>;
  try {
    deleteResult = await repository.delete(projectId);
  } catch (error) {
    await billing.requests.recordFailure(projectId, failureMessage(error));
    return err(PROJECT_REPOSITORY_ERROR);
  }
  if (deleteResult.isErr()) {
    await billing.requests.recordFailure(projectId, "project_delete_failed");
    return err(deleteResult.error);
  }
  const completed = await billing.requests.complete(projectId);
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
  if (deps.billing) {
    const opened = await deps.billing.requests.open({
      projectId: input.projectId,
      requestedByUserId: input.userId,
    });
    if (opened.isErr()) {
      // 要求を残せていないので「受付済み」とは扱わない。
      return err(PROJECT_REPOSITORY_ERROR);
    }
    deleted = await closeBillingAndDelete(
      deps.repository,
      deps.billing,
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
 * Never throws。オーナーが確認名つきで受け付けた削除要求を、課金が確認できるまで再試行する。
 * 本体が既に無い要求は完了印だけ付ける。
 */
export async function recoverProjectDeletions(
  deps: Required<Pick<DeleteProjectDeps, "billing">> &
    Pick<DeleteProjectDeps, "repository">,
  input: { limit?: number } = {},
): Promise<RecoverProjectDeletionsSummary> {
  const summary: RecoverProjectDeletionsSummary = {
    examined: 0,
    completed: 0,
    stillPending: 0,
  };
  const listed = await deps.billing.requests.listPending(
    input.limit ?? DELETION_RECOVERY_BATCH_SIZE,
  );
  if (listed.isErr()) {
    throw new Error("Failed to list pending project deletion requests");
  }

  for (const request of listed.value) {
    summary.examined += 1;
    try {
      const result = await closeBillingAndDelete(
        deps.repository,
        deps.billing,
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
