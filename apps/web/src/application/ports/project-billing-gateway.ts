import type { SubscriptionLifecycle } from "../../domain/entities/subscription-lifecycle";

export type NextBilling =
  | { status: "scheduled"; date: string; amount: number; currency: string }
  | { status: "none" }
  | { status: "unavailable" };

export type ProjectBillingSubscription = {
  lifecycle: SubscriptionLifecycle;
  endsAt: string | null;
  nextBilling: NextBilling;
};

export type ProjectBilling = {
  projectId: string;
  entitlementState: "active" | "grace" | "suspended";
  subscription: ProjectBillingSubscription | null;
};

export interface ProjectBillingGateway {
  listProjectBilling(input: {
    billingAccountId: string;
    projectIds: string[];
  }): Promise<ProjectBilling[]>;
}
