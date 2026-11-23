import { z } from "zod";
import type { OwnershipTransferSettlementGateway } from "../../application/ports/ownership-transfer-settlement-gateway";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

const confirmSchema = z.object({
  recipientSubscribed: z.boolean(),
  previousSubscriptionLive: z.boolean(),
});

const settleSchema = z.object({
  status: z.enum(["settled", "review", "pending"]),
  reviewReason: z.string().nullable(),
});

export class ControlPlaneOwnershipTransferSettlementGateway
  implements OwnershipTransferSettlementGateway
{
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "confirmTransferPayment" | "settleOwnershipTransfer"
    >,
  ) {}

  async confirmPayment(
    input: Parameters<OwnershipTransferSettlementGateway["confirmPayment"]>[0],
  ) {
    return confirmSchema.parse(
      await this.controlPlane.confirmTransferPayment({
        projectId: input.projectId,
        transferId: input.transferId,
        fromBillingAccountId: input.fromUserId,
        toBillingAccountId: input.toUserId,
      }),
    );
  }

  async settle(
    input: Parameters<OwnershipTransferSettlementGateway["settle"]>[0],
  ) {
    return settleSchema.parse(
      await this.controlPlane.settleOwnershipTransfer({
        projectId: input.projectId,
        transferId: input.transferId,
        outcome: input.outcome,
        fromBillingAccountId: input.fromUserId,
        toBillingAccountId: input.toUserId,
        switchedAt: input.switchedAt,
      }),
    );
  }
}
