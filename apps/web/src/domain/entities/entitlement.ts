export type EntitlementPlan = "unlimited" | "free" | "pro";

export type EntitlementState = "active" | "grace" | "restricted";

export type Entitlement = {
  billingAccountId: string;
  plan: EntitlementPlan;
  state: EntitlementState;
  limits: {
    maxOwnedProjects: number | null;
  };
  validUntil: string | null;
  revision: number;
  cache: {
    maxAgeSeconds: number;
    staleIfErrorSeconds: number;
  };
};
