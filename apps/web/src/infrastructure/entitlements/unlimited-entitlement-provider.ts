import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import type { ProjectEntitlement } from "../../domain/entities/entitlement";

export class UnlimitedEntitlementProvider implements EntitlementProvider {
  async getProjectEntitlement(projectId: string): Promise<ProjectEntitlement> {
    return {
      projectId,
      state: "active",
      validUntil: null,
      revision: 1,
      cache: {
        maxAgeSeconds: 3600,
        staleIfErrorSeconds: 86400,
      },
    };
  }
}
