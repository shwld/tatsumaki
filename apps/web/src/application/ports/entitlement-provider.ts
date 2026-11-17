import type { ProjectEntitlement } from "../../domain/entities/entitlement";

export interface EntitlementProvider {
  getProjectEntitlement(projectId: string): Promise<ProjectEntitlement>;
}
