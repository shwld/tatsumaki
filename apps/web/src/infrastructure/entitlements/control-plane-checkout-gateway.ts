import type { ProjectCheckoutGateway } from "../../application/ports/project-checkout-gateway";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";
import { parseSessionResponse } from "./session-response";

export class ControlPlaneCheckoutGateway implements ProjectCheckoutGateway {
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "createCheckoutSession"
    >,
  ) {}

  async createProjectCheckout(
    input: Parameters<ProjectCheckoutGateway["createProjectCheckout"]>[0],
  ): Promise<{ url: string }> {
    return parseSessionResponse(
      await this.controlPlane.createCheckoutSession(input),
    );
  }
}
