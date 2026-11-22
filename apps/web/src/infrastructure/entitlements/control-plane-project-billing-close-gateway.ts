import { z } from "zod";
import type { ProjectBillingCloseGateway } from "../../application/ports/project-billing-close-gateway";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

const closeSchema = z.object({
  projectId: z.string().min(1),
  canceledSubscriptionCount: z.number().int().nonnegative(),
});

export class ControlPlaneProjectBillingCloseGateway
  implements ProjectBillingCloseGateway
{
  constructor(
    private readonly controlPlane: Pick<ControlPlaneRpc, "closeProjectBilling">,
  ) {}

  async closeProjectBilling(input: { projectId: string }): Promise<void> {
    const response = closeSchema.parse(
      await this.controlPlane.closeProjectBilling(input),
    );
    if (response.projectId !== input.projectId) {
      throw new Error("Control Plane closed a different project");
    }
  }
}
