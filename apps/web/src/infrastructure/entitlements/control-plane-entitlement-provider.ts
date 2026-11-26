import { z } from "zod";
import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import type { StartProjectOperationInput } from "../../application/ports/project-operations-gateway";
import type { ProjectEntitlement } from "../../domain/entities/entitlement";

export interface ControlPlaneRpc {
  getProjectEntitlement(input: { projectId: string }): Promise<unknown>;
  getProjectUsage(input: { projectId: string }): Promise<unknown>;
  listProjectOperations(input: {
    accountId: string;
    projectIds: string[];
    locale: "ja" | "en";
  }): Promise<unknown>;
  startProjectOperation(input: StartProjectOperationInput): Promise<unknown>;
  startAccountOperation(input: {
    accountId: string;
    operation: "manage";
    returnUrl: string;
  }): Promise<unknown>;
  createCheckoutSession(input: {
    billingAccountId: string;
    projectId: string;
    projectName: string;
    requestId: string;
    successUrl: string;
    cancelUrl: string;
    transferId?: string;
  }): Promise<unknown>;
  expireTransferCheckout(input: {
    billingAccountId: string;
    projectId: string;
    transferId: string;
  }): Promise<unknown>;
  confirmTransferPayment(input: {
    projectId: string;
    transferId: string;
    fromBillingAccountId: string;
    toBillingAccountId: string;
  }): Promise<unknown>;
  settleOwnershipTransfer(input: {
    projectId: string;
    transferId: string;
    outcome: "switched" | "not-switched";
    fromBillingAccountId: string;
    toBillingAccountId: string;
    switchedAt: string;
  }): Promise<unknown>;
  syncProjectDisplayNames(input: {
    billingAccountId: string;
    projects: { projectId: string; name: string }[];
  }): Promise<unknown>;
  listProjectBilling(input: {
    billingAccountId: string;
    projectIds: string[];
  }): Promise<unknown>;
  closeProjectBilling(input: { projectId: string }): Promise<unknown>;
}

const entitlementSchema = z.object({
  projectId: z.string().min(1),
  state: z.enum(["active", "grace", "suspended"]),
  validUntil: z.iso.datetime().nullable(),
  revision: z.number().int().positive(),
  cache: z.object({
    maxAgeSeconds: z.number().int().nonnegative(),
    staleIfErrorSeconds: z.number().int().nonnegative(),
  }),
});

export class ControlPlaneEntitlementProvider implements EntitlementProvider {
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "getProjectEntitlement"
    >,
  ) {}

  async getProjectEntitlement(projectId: string): Promise<ProjectEntitlement> {
    const response = await this.controlPlane.getProjectEntitlement({
      projectId,
    });
    const entitlement = entitlementSchema.parse(response);
    if (entitlement.projectId !== projectId) {
      throw new Error("Control Plane returned a different project");
    }
    return entitlement;
  }
}
