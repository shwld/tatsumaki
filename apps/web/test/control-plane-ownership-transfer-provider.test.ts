import { describe, expect, it, vi } from "vitest";
import { ControlPlaneOwnershipTransferProvider } from "../src/infrastructure/entitlements/control-plane-ownership-transfer-provider";

describe("ControlPlaneOwnershipTransferProvider", () => {
  it("passes the transfer and both participants to the provider", async () => {
    const rpc = {
      getOwnershipEligibility: vi.fn(async () => ({ status: "allowed" })),
      recordOwnershipTransferOutcome: vi.fn(),
      startOwnershipAcquisition: vi.fn(),
    };
    const provider = new ControlPlaneOwnershipTransferProvider(rpc);
    await expect(
      provider.getEligibility({
        projectId: "p",
        transferId: "t",
        previousOwnerId: "old",
        recipientId: "new",
      }),
    ).resolves.toBe("allowed");
    expect(rpc.getOwnershipEligibility).toHaveBeenCalledWith({
      projectId: "p",
      transferId: "t",
      currentOwnerId: "old",
      recipientId: "new",
    });
  });
  it("rejects an invalid eligibility response", async () => {
    const provider = new ControlPlaneOwnershipTransferProvider({
      getOwnershipEligibility: async () => ({ status: "unknown" }),
      recordOwnershipTransferOutcome: vi.fn(),
      startOwnershipAcquisition: vi.fn(),
    });
    await expect(
      provider.getEligibility({
        projectId: "p",
        transferId: "t",
        previousOwnerId: "old",
        recipientId: "new",
      }),
    ).rejects.toThrow();
  });
});
