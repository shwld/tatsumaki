export type ProjectCreationRequestStatus = "pending" | "created";

export type ProjectCreationRequest = {
  projectId: string;
  purchaserUserId: string;
  name: string;
  idempotencyKey: string;
  checkoutRequestId: string;
  status: ProjectCreationRequestStatus;
};
