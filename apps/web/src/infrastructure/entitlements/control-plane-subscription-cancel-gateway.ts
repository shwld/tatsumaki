import type { ProjectSubscriptionCancelGateway } from "../../application/ports/project-subscription-cancel-gateway";
import {
  parseSessionResponse,
  type ControlPlaneRpc,
} from "./control-plane-entitlement-provider";

export class ControlPlaneSubscriptionCancelGateway
  implements ProjectSubscriptionCancelGateway
{
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "createSubscriptionCancelSession"
    >,
  ) {}

  async createCancelSession(
    input: Parameters<
      ProjectSubscriptionCancelGateway["createCancelSession"]
    >[0],
  ): Promise<{ url: string }> {
    return parseSessionResponse(
      await this.controlPlane.createSubscriptionCancelSession(input),
    );
  }
}
