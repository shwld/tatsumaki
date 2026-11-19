import { z } from "zod";
import type {
  ProjectBilling,
  ProjectBillingGateway,
} from "../../application/ports/project-billing-gateway";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

const nextBillingSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("scheduled"),
    date: z.iso.datetime(),
    amount: z.number().int().nonnegative(),
    currency: z.string().regex(/^[a-z]{3}$/),
  }),
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("unavailable") }),
]);

const responseSchema = z.object({
  projects: z.array(
    z.object({
      projectId: z.string().min(1),
      entitlementState: z.enum(["active", "grace", "suspended"]),
      subscription: z
        .object({
          status: z.string().min(1),
          endsAt: z.iso.datetime().nullable(),
          nextBilling: nextBillingSchema,
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
