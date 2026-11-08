import type { Epic } from "./epic";

/** Story counts of one epic, or of several epics with shared stories counted once. */
export type StoryCounts = {
  total: number;
  accepted: number;
  /** Started, Finished, Delivered or Rejected, outside the Icebox. */
  inProgress: number;
  /** Unstarted, outside the Icebox. */
  unstarted: number;
  icebox: number;
  /** Not accepted and waiting on an unresolved blocker; supplementary, overlaps the other counts. */
  blocked: number;
};

/** Accepted points of estimated features; every other story is left out of the point basis. */
export type PointCounts = {
  estimatedPoints: number;
  acceptedPoints: number;
  excludedStories: number;
};

export type EpicStoryAggregate = StoryCounts & PointCounts;

export const EPIC_PROGRESS_STATES = [
  "no_stories",
  "not_started",
  "in_progress",
  "completed",
] as const;

export type EpicProgressState = (typeof EPIC_PROGRESS_STATES)[number];

export type EpicProgress = {
  state: EpicProgressState;
  /** Accepted ÷ all stories carrying the label; null while no story carries it. */
  storyCompletionRate: number | null;
  stories: StoryCounts;
  /** Accepted points ÷ points of estimated features; null while none is estimated. */
  pointCompletionRate: number | null;
  points: PointCounts;
  /** The planned end has passed and a story is not accepted yet. A fact, not a forecast. */
  overdue: boolean;
};

export type EpicWithProgress = {
  epic: Epic;
  progress: EpicProgress;
};

export type EpicStory = {
  id: string;
  storyNumber: number;
  title: string;
  type: string;
  status: string;
  isIcebox: boolean;
  isBlocked: boolean;
  storyPoint: number | null;
};

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function deriveState(counts: StoryCounts): EpicProgressState {
  if (counts.total === 0) return "no_stories";
  if (counts.accepted === counts.total) return "completed";
  if (counts.accepted === 0 && counts.inProgress === 0) return "not_started";
  return "in_progress";
}

export function toStoryCounts(aggregate: EpicStoryAggregate): StoryCounts {
  return {
    total: aggregate.total,
    accepted: aggregate.accepted,
    inProgress: aggregate.inProgress,
    unstarted: aggregate.unstarted,
    icebox: aggregate.icebox,
    blocked: aggregate.blocked,
  };
}

/** `today` is a YYYY-MM-DD calendar date; the planned end day itself is not overdue. */
export function deriveEpicProgress(
  epic: Pick<Epic, "plannedEnd">,
  aggregate: EpicStoryAggregate,
  today: string,
): EpicProgress {
  const stories = toStoryCounts(aggregate);
  return {
    state: deriveState(stories),
    storyCompletionRate: rate(stories.accepted, stories.total),
    stories,
    pointCompletionRate: rate(
      aggregate.acceptedPoints,
      aggregate.estimatedPoints,
    ),
    points: {
      estimatedPoints: aggregate.estimatedPoints,
      acceptedPoints: aggregate.acceptedPoints,
      excludedStories: aggregate.excludedStories,
    },
    overdue:
      epic.plannedEnd !== null &&
      epic.plannedEnd < today &&
      stories.accepted < stories.total,
  };
}
