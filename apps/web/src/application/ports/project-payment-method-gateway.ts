export interface ProjectPaymentMethodGateway {
  createPaymentMethodUpdateSession(input: {
    billingAccountId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
}
