export interface ProjectCreationAcquisition {
  start(input: {
    accountId: string;
    projectId: string;
    projectName: string;
    requestId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
}
