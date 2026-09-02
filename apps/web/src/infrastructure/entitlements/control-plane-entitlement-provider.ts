import { z } from "zod";
import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import type { Entitlement } from "../../domain/entities/entitlement";

export interface ControlPlaneRpc {
  getEntitlement(input: { billingAccountId: string }): Promise<unknown>;
}

const entitlementSchema = z.object({
  billingAccountId: z.string().min(1),
  plan: z.enum(["free", "pro"]),
  state: z.enum(["active", "grace", "restricted"]),
  limits: z.object({
    maxOwnedProjects: z.number().int().nonnegative().nullable(),
  }),
  validUntil: z.iso.datetime().nullable(),
  revision: z.number().int().positive(),
  cache: z.object({
    maxAgeSeconds: z.number().int().nonnegative(),
    staleIfErrorSeconds: z.number().int().nonnegative(),
  }),
});

export class ControlPlaneEntitlementProvider implements EntitlementProvider {
  constructor(private readonly controlPlane: ControlPlaneRpc) {}

  async getEntitlement(billingAccountId: string): Promise<Entitlement> {
    const response = await this.controlPlane.getEntitlement({
      billingAccountId,
    });
    const entitlement = entitlementSchema.parse(response);
    if (entitlement.billingAccountId !== billingAccountId) {
      throw new Error("Control Plane returned a different billing account");
    }
    return entitlement;
  }
}
