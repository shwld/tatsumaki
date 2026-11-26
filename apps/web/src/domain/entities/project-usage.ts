/** `ending`: the end is settled. `action_required`: acting before `until` keeps the project usable. */
export const PROJECT_USAGE_DEADLINE_REASONS = [
  "ending",
  "action_required",
] as const;

export type ProjectUsageDeadlineReason =
  (typeof PROJECT_USAGE_DEADLINE_REASONS)[number];

export type ProjectUsageDeadline =
  | { until: null; untilReason: null }
  | { until: string; untilReason: ProjectUsageDeadlineReason };

export type ProjectUsage = ProjectUsageDeadline & {
  projectId: string;
  /** Whether writes and export are allowed. */
  allowed: boolean;
  revision: number;
  cache: {
    maxAgeSeconds: number;
    staleIfErrorSeconds: number;
  };
};

/** What the app displays: usable, usable until a deadline, view only, or not confirmable. */
export type ProjectAccessState =
  | { kind: "available" }
  | { kind: "limited"; until: string; untilReason: ProjectUsageDeadlineReason }
  | { kind: "read_only" }
  | { kind: "unknown" };
