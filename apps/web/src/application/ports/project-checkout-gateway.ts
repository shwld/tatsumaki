export type ProjectCheckoutInput = {
  billingAccountId: string;
  projectId: string;
  requestId: string;
  successUrl: string;
  cancelUrl: string;
};

export interface ProjectCheckoutGateway {
  createProjectCheckout(input: ProjectCheckoutInput): Promise<{ url: string }>;
}
