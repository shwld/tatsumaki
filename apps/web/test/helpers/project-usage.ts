export type UsageKind =
  | "available"
  | "ending"
  | "action_required"
  | "read_only";

export const projectUsage = (
  kind: UsageKind = "available",
  overrides: Record<string, unknown> = {},
) => ({
  projectId: "p1",
  allowed: kind !== "read_only",
  ...(kind === "ending" || kind === "action_required"
    ? { until: "2999-01-01T00:00:00Z", untilReason: kind }
    : { until: null, untilReason: null }),
  revision: 1,
  cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
  ...overrides,
});
