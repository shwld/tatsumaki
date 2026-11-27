import { z } from "zod";
import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import type { StartProjectOperationInput } from "../../application/ports/project-operations-gateway";
import type { ProjectEntitlement } from "../../domain/entities/entitlement";

export interface ControlPlaneRpc {
  startOwnershipAcquisition(input: {
    projectId: string;
    transferId: string;
    recipientId: string;
    projectName: string;
    requestId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<unknown>;
  recordProjectRenamed(input: {
    projectId: string;
    name: string;
    revision: number;
  }): Promise<void>;
  startCreationAcquisition(input: {
    accountId: string;
    projectId: string;
    projectName: string;
    requestId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<unknown>;
  recordProjectDeleted(input: { projectId: string }): Promise<void>;
  getOwnershipEligibility(input: {
    projectId: string;
    transferId: string;
    currentOwnerId: string;
    recipientId: string;
  }): Promise<unknown>;
  recordOwnershipTransferOutcome(input: {
    projectId: string;
    transferId: string;
    previousOwnerId: string;
    recipientId: string;
    outcome: "switched" | "not-switched";
    occurredAt: string;
  }): Promise<void>;
  recordProjectCreationOutcome(input: {
    projectId: string;
    accountId: string;
    outcome: "created" | "failed";
    occurredAt: string;
  }): Promise<void>;
  getCreationEligibility(input: {
    projectId: string;
    accountId: string;
    requestedAt: string;
  }): Promise<unknown>;
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
