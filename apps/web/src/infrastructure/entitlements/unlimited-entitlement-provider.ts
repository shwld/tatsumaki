import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import type { Entitlement } from "../../domain/entities/entitlement";

export class UnlimitedEntitlementProvider implements EntitlementProvider {
  async getEntitlement(billingAccountId: string): Promise<Entitlement> {
    return {
      billingAccountId,
      plan: "unlimited",
      state: "active",
      limits: { maxOwnedProjects: null },
      validUntil: null,
      revision: 1,
      cache: {
        maxAgeSeconds: 3600,
        staleIfErrorSeconds: 86400,
      },
    };
  }
}
