import type { Entitlement } from "../../domain/entities/entitlement";

export interface EntitlementProvider {
  getEntitlement(billingAccountId: string): Promise<Entitlement>;
}
