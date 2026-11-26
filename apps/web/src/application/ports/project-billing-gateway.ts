import type { SubscriptionLifecycle } from "../../domain/entities/subscription-lifecycle";

export type ProjectBillingSubscription = {
  lifecycle: SubscriptionLifecycle;
  /** 所有権譲渡の受け手として購読した場合の申請ID。通常の購読では null。 */
  transferId: string | null;
};

export type ProjectBilling = {
  projectId: string;
  subscription: ProjectBillingSubscription | null;
};

export interface ProjectBillingGateway {
  listProjectBilling(input: {
    billingAccountId: string;
    projectIds: string[];
  }): Promise<ProjectBilling[]>;
}
