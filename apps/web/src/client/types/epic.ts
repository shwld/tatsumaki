export type EpicOutcomeStatus = "unevaluated" | "achieved" | "missed";

export type Epic = {
  id: string;
  projectId: string;
  labelId: string;
  labelName: string;
  labelColor: string;
  enabled: boolean;
  description: string;
  successCriteria: string;
  ownerId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  outcomeStatus: EpicOutcomeStatus;
  revision: number;
};

export type LabelDeletionImpact = {
  labelId: string;
  labelName: string;
  storyCount: number;
  epic: { id: string; enabled: boolean; hasPlan: boolean } | null;
};

export type EpicPlanInput = {
  description: string;
  successCriteria: string;
  ownerId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  outcomeStatus: EpicOutcomeStatus;
};

export type EpicProgressState =
  | "no_stories"
  | "not_started"
  | "in_progress"
  | "completed";

export type EpicStoryCounts = {
  total: number;
  accepted: number;
  inProgress: number;
  unstarted: number;
  icebox: number;
  blocked: number;
};

export type EpicProgress = {
  state: EpicProgressState;
  storyCompletionRate: number | null;
  stories: EpicStoryCounts;
  pointCompletionRate: number | null;
  points: {
    estimatedPoints: number;
    acceptedPoints: number;
    excludedStories: number;
  };
  overdue: boolean;
};

export type EpicWithProgress = { epic: Epic; progress: EpicProgress };
