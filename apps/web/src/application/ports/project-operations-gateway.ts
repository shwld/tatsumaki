import type {
  AccountOperation,
  ProjectOperation,
} from "../../domain/entities/project-operation";

export type ProjectOperationsLocale = "ja" | "en";

/** Guidance the app's own status cannot express: plain text and an https destination. */
export type ProjectNotice = { text: string; url: string };

export type ProjectOperationsList = {
  accountOperations: AccountOperation[];
  projects: {
    projectId: string;
    operations: ProjectOperation[];
    notice: ProjectNotice | null;
  }[];
};

export type StartProjectOperationInput = {
  accountId: string;
  projectId: string;
} & (
  | {
      operation: "resume";
      projectName: string;
      requestId: string;
      successUrl: string;
      cancelUrl: string;
    }
  | { operation: Exclude<ProjectOperation, "resume">; returnUrl: string }
);

export interface ProjectOperationsGateway {
  listProjectOperations(input: {
    accountId: string;
    projectIds: string[];
    locale: ProjectOperationsLocale;
  }): Promise<ProjectOperationsList>;
  startProjectOperation(
    input: StartProjectOperationInput,
  ): Promise<{ url: string }>;
  startAccountOperation(input: {
    accountId: string;
    operation: AccountOperation;
    returnUrl: string;
  }): Promise<{ url: string }>;
}
