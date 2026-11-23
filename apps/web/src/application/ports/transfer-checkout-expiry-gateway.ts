export interface TransferCheckoutExpiryGateway {
  /** 申請に紐づく未決済の Checkout を無効にする。無ければ何もしない。 */
  expireTransferCheckout(input: {
    billingAccountId: string;
    projectId: string;
    transferId: string;
  }): Promise<void>;
}
