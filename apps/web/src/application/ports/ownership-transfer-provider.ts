export type OwnershipEligibility = "allowed" | "pending" | "denied";

export type OwnershipTransferOutcome = {
  projectId: string;
  transferId: string;
  previousOwnerId: string;
  recipientId: string;
  outcome: "switched" | "not-switched";
  occurredAt: string;
};

export interface OwnershipTransferProvider {
  getEligibility(
    input: Omit<OwnershipTransferOutcome, "outcome" | "occurredAt">,
  ): Promise<OwnershipEligibility>;
  recordOutcome(input: OwnershipTransferOutcome): Promise<void>;
  startAcquisition(input: {
    projectId: string;
    transferId: string;
    recipientId: string;
    projectName: string;
    requestId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
}
