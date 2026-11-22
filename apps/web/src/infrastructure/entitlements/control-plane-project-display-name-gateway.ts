import { z } from "zod";
import type { ProjectDisplayNameGateway } from "../../application/ports/project-display-name-gateway";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

const responseSchema = z.object({
  updatedSubscriptionCount: z.number().int().nonnegative(),
});

export class ControlPlaneProjectDisplayNameGateway
  implements ProjectDisplayNameGateway
{
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "syncProjectDisplayNames"
    >,
  ) {}

  async syncProjectDisplayNames(
    input: Parameters<ProjectDisplayNameGateway["syncProjectDisplayNames"]>[0],
  ): Promise<void> {
    responseSchema.parse(
      await this.controlPlane.syncProjectDisplayNames(input),
    );
  }
}
