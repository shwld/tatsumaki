export type ProjectCheckoutInput = {
  billingAccountId: string;
  projectId: string;
  projectName: string;
  requestId: string;
  successUrl: string;
  cancelUrl: string;
  /** 所有権譲渡の受け手の Checkout にだけ付ける。 */
  transferId?: string;
};

export interface ProjectCheckoutGateway {
  createProjectCheckout(input: ProjectCheckoutInput): Promise<{ url: string }>;
}
