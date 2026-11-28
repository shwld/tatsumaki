import { z } from "zod";
import type { OwnershipTransferProvider } from "../../application/ports/ownership-transfer-provider";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";
import { parseSessionResponse } from "./session-response";

const eligibilitySchema = z.object({
  status: z.enum(["allowed", "pending", "denied"]),
});

export class ControlPlaneOwnershipTransferProvider
  implements OwnershipTransferProvider
{
  constructor(
    private readonly rpc: Pick<
      ControlPlaneRpc,
      | "getOwnershipEligibility"
      | "recordOwnershipTransferOutcome"
      | "startOwnershipAcquisition"
    >,
  ) {}

  async getEligibility(
    input: Parameters<OwnershipTransferProvider["getEligibility"]>[0],
  ) {
    return eligibilitySchema.parse(
      await this.rpc.getOwnershipEligibility({
        projectId: input.projectId,
        transferId: input.transferId,
        currentOwnerId: input.previousOwnerId,
        recipientId: input.recipientId,
      }),
    ).status;
  }

  async recordOutcome(
    input: Parameters<OwnershipTransferProvider["recordOutcome"]>[0],
  ): Promise<void> {
    await this.rpc.recordOwnershipTransferOutcome(input);
  }
  async startAcquisition(
    input: Parameters<OwnershipTransferProvider["startAcquisition"]>[0],
  ): Promise<{ url: string }> {
    return parseSessionResponse(
      await this.rpc.startOwnershipAcquisition(input),
    );
  }
}
