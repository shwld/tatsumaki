export interface ProjectSubscriptionCancelGateway {
  createCancelSession(input: {
    billingAccountId: string;
    projectId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
}
