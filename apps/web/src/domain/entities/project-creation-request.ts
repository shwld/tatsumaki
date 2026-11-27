export type ProjectCreationRequestStatus = "pending" | "created";

export type ProjectCreationStalledReason =
  | "abandoned"
  | "creation_failed"
  | "entitlement_unconfirmed";

export type ProjectCreationRequest = {
  projectId: string;
  purchaserUserId: string;
  name: string;
  idempotencyKey: string;
  checkoutRequestId: string;
  status: ProjectCreationRequestStatus;
  attemptCount: number;
  materializeFailureCount: number;
  stalledReason: ProjectCreationStalledReason | null;
  createdAt: string;
};
