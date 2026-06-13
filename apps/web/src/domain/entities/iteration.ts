export const SPRINT_UTILIZATION_PERCENT_MIN = 0;
export const SPRINT_UTILIZATION_PERCENT_MAX = 100;

export function isValidSprintUtilizationPercent(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= SPRINT_UTILIZATION_PERCENT_MIN &&
    value <= SPRINT_UTILIZATION_PERCENT_MAX
  );
}

export type Iteration = {
  __typename: "Iteration";
  id: string;
  projectId: string;
  iterationNumber: number;
  startDate: string;
  endDate: string;
  totalPoints: number;
  effectiveSprintUtilizationPercent: number;
  createdAt: string;
  updatedAt: string;
};

export type IterationOverride = {
  __typename: "IterationOverride";
  id: string;
  projectId: string;
  iterationNumber: number;
  sprintUtilizationPercent: number;
  iterationStartDate: string | null;
  iterationEndDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
