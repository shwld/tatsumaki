import { err, ok, type Result } from "neverthrow";
import type {
  ProjectBilling,
  ProjectBillingGateway,
} from "../ports/project-billing-gateway";
import type { ProjectDisplayNameGateway } from "../ports/project-display-name-gateway";
import {
  PROJECT_REPOSITORY_ERROR,
  type ProjectRepository,
} from "../../domain/repositories/project-repository";

export const BILLING_GATEWAY_ERROR = "BILLING_GATEWAY_ERROR" as const;

export type ListOwnedProjectBillingError =
  | typeof PROJECT_REPOSITORY_ERROR
  | typeof BILLING_GATEWAY_ERROR;

export type OwnedProjectBilling = ProjectBilling & { projectName: string };

export async function listOwnedProjectBilling(
  repository: ProjectRepository,
  gateway: ProjectBillingGateway,
  userId: string,
  displayNames?: ProjectDisplayNameGateway,
): Promise<Result<OwnedProjectBilling[], ListOwnedProjectBillingError>> {
  const projects = await repository.listByMember(userId);
  if (projects.isErr()) {
    return err(PROJECT_REPOSITORY_ERROR);
  }
  const owned = projects.value.filter(
    (project) => project.currentUserRole === "owner",
  );
  if (owned.length === 0) {
    return ok([]);
  }

  let billing: ProjectBilling[];
  try {
    billing = await gateway.listProjectBilling({
      billingAccountId: userId,
      projectIds: owned.map((project) => project.id),
    });
  } catch {
    return err(BILLING_GATEWAY_ERROR);
  }

  // 名前変更時の同期失敗と、表示名導入前の購読を、一覧を開くたびに直す。失敗しても一覧は返す。
  if (displayNames) {
    try {
      await displayNames.syncProjectDisplayNames({
        billingAccountId: userId,
        projects: owned.map(({ id, name }) => ({ projectId: id, name })),
      });
    } catch {
      console.error("Failed to sync project display names");
    }
  }

  const billingByProject = new Map(
    billing.map((entry) => [entry.projectId, entry]),
  );
  const rows: OwnedProjectBilling[] = [];
  for (const project of owned) {
    const entry = billingByProject.get(project.id);
    if (entry === undefined) {
      return err(BILLING_GATEWAY_ERROR);
    }
    rows.push({ ...entry, projectName: project.name });
  }
  return ok(rows);
}
