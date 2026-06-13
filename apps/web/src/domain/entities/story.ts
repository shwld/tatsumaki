import { PRESET_POINT_SCALES } from "./project";

export const STORY_TYPES = ["feature", "bug", "chore", "release"] as const;
export const DEFAULT_STORY_POINTS = PRESET_POINT_SCALES.fibonacci;
export const STORY_STATUSES = [
  "Unstarted",
  "Started",
  "Finished",
  "Delivered",
  "Accepted",
  "Rejected",
] as const;
export const CARRY_OVER_STORY_STATUSES = [...STORY_STATUSES].filter(
  (status): status is StoryStatus => status !== "Accepted",
);

export type StoryType = (typeof STORY_TYPES)[number];
export type StoryPoint = number;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export type StoryRelation = {
  id: string;
  title: string;
};

const STORY_STATUS_TRANSITIONS: Record<StoryStatus, StoryStatus[]> = {
  Unstarted: ["Started"],
  Started: ["Unstarted", "Finished"],
  Finished: ["Started", "Delivered"],
  Delivered: ["Finished", "Accepted", "Rejected"],
  Accepted: ["Unstarted", "Started"],
  Rejected: ["Started"],
};

const ESTIMATE_REQUIRED_STATUSES: Set<StoryStatus> = new Set(["Started"]);

/** Story types that are exempt from the estimate requirement (PivotalTracker convention). */
const ESTIMATE_EXEMPT_TYPES: Set<StoryType> = new Set([
  "chore",
  "bug",
  "release",
]);

/**
 * Returns true if an estimate (storyPoint) is required before
 * transitioning to the given target status.
 * Chore and bug stories are exempt — only features require an estimate to Start.
 */
export function requiresEstimateForTransition(
  targetStatus: StoryStatus,
  storyPoint: number | null,
  storyType: StoryType,
): boolean {
  if (ESTIMATE_EXEMPT_TYPES.has(storyType)) {
    return false;
  }
  return ESTIMATE_REQUIRED_STATUSES.has(targetStatus) && storyPoint === null;
}

export function listAllowedStoryStatusTransitions(
  status: StoryStatus,
): StoryStatus[] {
  return STORY_STATUS_TRANSITIONS[status];
}

export function canTransitionStoryStatus(
  from: StoryStatus,
  to: StoryStatus,
): boolean {
  if (from === to) {
    return true;
  }

  return STORY_STATUS_TRANSITIONS[from].includes(to);
}

export type Story = {
  __typename: "Story";
  id: string;
  storyNumber: number;
  projectId: string;
  title: string;
  description: string;
  type: StoryType;
  status: StoryStatus;
  statusChangedAt: string;
  /** When status became Accepted; cleared when leaving Accepted. ISO timestamp. */
  completedAt: string | null;
  storyPoint: StoryPoint | null;
  labels: string[];
  epicId: string | null;
  iterationId: string | null;
  isIcebox: boolean;
  ownerIds: string[];
  requesterId: string | null;
  releaseDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  isBlocked?: boolean;
  isBlocking?: boolean;
  blockingStories?: StoryRelation[];
  blockedStories?: StoryRelation[];
};

export type StoryPriorityHistory = {
  __typename: "StoryPriorityHistory";
  id: string;
  storyId: string;
  fromPosition: number;
  toPosition: number;
  changedAt: string;
};
