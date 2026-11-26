import { z } from "zod";
import type {
  ProjectBilling,
  ProjectBillingGateway,
} from "../../application/ports/project-billing-gateway";
import { SUBSCRIPTION_LIFECYCLES } from "../../domain/entities/subscription-lifecycle";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

const responseSchema = z.object({
  projects: z.array(
    z.object({
      projectId: z.string().min(1),
      subscription: z
        .object({
          lifecycle: z.enum(SUBSCRIPTION_LIFECYCLES),
          transferId: z.string().min(1).nullable(),
        })
        .nullable(),
    }),
  ),
});

export class ControlPlaneProjectBillingGateway
  implements ProjectBillingGateway
{
  constructor(
    private readonly controlPlane: Pick<ControlPlaneRpc, "listProjectBilling">,
  ) {}

  async listProjectBilling(
    input: Parameters<ProjectBillingGateway["listProjectBilling"]>[0],
  ): Promise<ProjectBilling[]> {
    const { projects } = responseSchema.parse(
      await this.controlPlane.listProjectBilling(input),
    );
    const requested = new Set(input.projectIds);
    if (projects.some((project) => !requested.has(project.projectId))) {
      throw new Error(
        "Control Plane returned a project that was not requested",
      );
    }
    return projects;
  }
}
