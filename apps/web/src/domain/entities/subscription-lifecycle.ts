export const SUBSCRIPTION_LIFECYCLES = ["live", "ending", "ended"] as const;

export type SubscriptionLifecycle = (typeof SUBSCRIPTION_LIFECYCLES)[number];

export const isSubscriptionEnded = (
  lifecycle: SubscriptionLifecycle,
): boolean => lifecycle === "ended";
