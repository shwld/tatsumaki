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
