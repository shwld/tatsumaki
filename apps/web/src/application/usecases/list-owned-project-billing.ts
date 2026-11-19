import { err, ok, type Result } from "neverthrow";
import type {
  ProjectBilling,
  ProjectBillingGateway,
} from "../ports/project-billing-gateway";
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
