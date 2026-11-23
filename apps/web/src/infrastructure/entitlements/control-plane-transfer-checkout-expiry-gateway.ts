import type { TransferCheckoutExpiryGateway } from "../../application/ports/transfer-checkout-expiry-gateway";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

export class ControlPlaneTransferCheckoutExpiryGateway
  implements TransferCheckoutExpiryGateway
{
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "expireTransferCheckout"
    >,
  ) {}

  async expireTransferCheckout(
    input: Parameters<
      TransferCheckoutExpiryGateway["expireTransferCheckout"]
    >[0],
  ): Promise<void> {
    await this.controlPlane.expireTransferCheckout(input);
  }
}
