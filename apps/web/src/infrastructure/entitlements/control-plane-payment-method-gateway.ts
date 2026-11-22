import type { ProjectPaymentMethodGateway } from "../../application/ports/project-payment-method-gateway";
import {
  parseSessionResponse,
  type ControlPlaneRpc,
} from "./control-plane-entitlement-provider";

export class ControlPlanePaymentMethodGateway
  implements ProjectPaymentMethodGateway
{
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "createPaymentMethodUpdateSession"
    >,
  ) {}

  async createPaymentMethodUpdateSession(
    input: Parameters<
      ProjectPaymentMethodGateway["createPaymentMethodUpdateSession"]
    >[0],
  ): Promise<{ url: string }> {
    return parseSessionResponse(
      await this.controlPlane.createPaymentMethodUpdateSession(input),
    );
  }
}
