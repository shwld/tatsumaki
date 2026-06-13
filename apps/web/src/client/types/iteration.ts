export type Iteration = {
  __typename: "Iteration";
  id: string;
  projectId: string;
  iterationNumber?: number;
  startDate: string;
  endDate: string;
  totalPoints: number;
  effectiveSprintUtilizationPercent?: number;
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

export type IterationsResponse = {
  iterations: Iteration[];
  iterationOverrides?: IterationOverride[];
  velocity: number;
};
