export const EPIC_OUTCOME_STATUSES = [
  "unevaluated",
  "achieved",
  "missed",
] as const;

export type EpicOutcomeStatus = (typeof EPIC_OUTCOME_STATUSES)[number];

/**
 * Strategy planning attached to exactly one label (ADR-0013). The label is the
 * source of the name and color; the epic never has a name of its own.
 */
export type Epic = {
  __typename: "Epic";
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
  position: number;
  outcomeStatus: EpicOutcomeStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type EpicPlan = {
  description: string;
  successCriteria: string;
  ownerId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  outcomeStatus: EpicOutcomeStatus;
};

export function isEpicOutcomeStatus(
  value: unknown,
): value is EpicOutcomeStatus {
  return (
    typeof value === "string" &&
    (EPIC_OUTCOME_STATUSES as readonly string[]).includes(value)
  );
}

export function hasEpicPlan(epic: EpicPlan): boolean {
  return (
    epic.description !== "" ||
    epic.successCriteria !== "" ||
    epic.ownerId !== null ||
    epic.plannedStart !== null ||
    epic.outcomeStatus !== "unevaluated"
  );
}
