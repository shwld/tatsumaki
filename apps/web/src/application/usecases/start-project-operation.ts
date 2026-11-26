import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import type { ProjectDeletionRequestRepository } from "../../domain/repositories/project-deletion-request-repository";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import type { ProjectOperation } from "../../domain/entities/project-operation";
import type { ProjectOperationsGateway } from "../ports/project-operations-gateway";
import { deterministicRequestId } from "./deterministic-request-id";

export const OPERATION_NOT_FOUND_ERROR = "OPERATION_NOT_FOUND_ERROR" as const;
export const OPERATION_FORBIDDEN_ERROR = "OPERATION_FORBIDDEN_ERROR" as const;
export const OPERATION_NOT_OFFERED_ERROR =
  "OPERATION_NOT_OFFERED_ERROR" as const;
export const OPERATION_PROJECT_DELETING_ERROR =
  "OPERATION_PROJECT_DELETING_ERROR" as const;
export const OPERATION_UNAVAILABLE_ERROR =
  "OPERATION_UNAVAILABLE_ERROR" as const;

export type StartProjectOperationError =
  | typeof OPERATION_NOT_FOUND_ERROR
  | typeof OPERATION_FORBIDDEN_ERROR
  | typeof OPERATION_NOT_OFFERED_ERROR
  | typeof OPERATION_PROJECT_DELETING_ERROR
  | typeof OPERATION_UNAVAILABLE_ERROR;

/**
 * 認可はここで行い、操作できる対象かは提供者が呼び出し元自身の権利から判定し直す。
 * 移動先の有効期間は短いため、利用者が操作を選んだときにだけ取得する。
 */
export async function startProjectOperation(
  deps: {
    projects: Pick<ProjectRepository, "findMember" | "findById">;
    deletions: Pick<ProjectDeletionRequestRepository, "findById">;
    operations: ProjectOperationsGateway;
  },
  input: {
    userId: string;
    projectId: string;
    operation: ProjectOperation;
    now: Date;
    returnUrl: string;
    successUrl: string;
    cancelUrl: string;
  },
  checkoutEnabled: boolean,
): Promise<Result<{ url: string }, StartProjectOperationError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(OPERATION_UNAVAILABLE_ERROR);
  if (!member.value) return err(OPERATION_NOT_FOUND_ERROR);
  if (member.value.role !== "owner") return err(OPERATION_FORBIDDEN_ERROR);

  const target = { accountId: input.userId, projectId: input.projectId };
  try {
    if (input.operation !== "resume") {
      return ok(
        await deps.operations.startProjectOperation({
          ...target,
          operation: input.operation,
          returnUrl: input.returnUrl,
        }),
      );
    }

    if (!checkoutEnabled) return err(OPERATION_NOT_OFFERED_ERROR);
    // 削除要求の受付後は再開させない。提供者側の閉鎖が最終防衛線。
    const deletion = await deps.deletions.findById(input.projectId);
    if (deletion.isErr()) return err(OPERATION_UNAVAILABLE_ERROR);
    if (deletion.value) return err(OPERATION_PROJECT_DELETING_ERROR);

    const project = await deps.projects.findById(input.projectId);
    if (project.isErr() || !project.value) {
      return err(OPERATION_UNAVAILABLE_ERROR);
    }
    return ok(
      await deps.operations.startProjectOperation({
        ...target,
        operation: "resume",
        projectName: project.value.name,
        // 二重クリック・再試行が同じ移動先になるよう、projectId と UTC 日付から決める。
        requestId: await deterministicRequestId(
          `resume:${input.projectId}:${input.now.toISOString().slice(0, 10)}`,
        ),
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      }),
    );
  } catch {
    return err(OPERATION_UNAVAILABLE_ERROR);
  }
}
