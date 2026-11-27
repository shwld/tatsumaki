export type ProjectCreationEligibility =
  | { status: "allowed" }
  | { status: "pending"; deadline: string }
  | { status: "denied" };

export interface ProjectCreationEligibilityGateway {
  getEligibility(input: {
    projectId: string;
    accountId: string;
    requestedAt: string;
  }): Promise<ProjectCreationEligibility>;
}

export interface ProjectCreationOutcomeGateway {
  recordOutcome(
    input: import("../../domain/repositories/project-creation-request-repository").ProjectCreationOutcome,
  ): Promise<void>;
}
