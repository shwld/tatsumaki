export type TransferSettlementOutcome = "switched" | "not-switched";

export type TransferPaymentState = {
  recipientSubscribed: boolean;
  previousSubscriptionLive: boolean;
};

export type TransferSettlementResult = {
  /** review は自動では返金できず運営が調査する。pending は返金が確定しておらず、再確認する。 */
  status: "settled" | "review" | "pending";
  reviewReason: string | null;
};

export interface OwnershipTransferSettlementGateway {
  /** 受け手の購読がこの申請の決済として支払い済みか、旧購読がまだ置き換え可能かを返す。 */
  confirmPayment(input: {
    projectId: string;
    transferId: string;
    fromUserId: string;
    toUserId: string;
  }): Promise<TransferPaymentState>;
  /** 冪等。switched は受け手の支払い済みの購読が無ければ拒否する。 */
  settle(input: {
    projectId: string;
    transferId: string;
    outcome: TransferSettlementOutcome;
    fromUserId: string;
    toUserId: string;
    switchedAt: string;
  }): Promise<TransferSettlementResult>;
}
