export type ProjectCreationRequestStatus = "pending" | "created";

// abandoned: 期限内に支払いが確認できなかった(運用対応不要)。
// creation_failed / entitlement_unavailable: 支払い済みの可能性があり、運用者の調査・返金判断が必要。
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
  paymentEvidence: boolean;
  stalledReason: ProjectCreationStalledReason | null;
  createdAt: string;
};
