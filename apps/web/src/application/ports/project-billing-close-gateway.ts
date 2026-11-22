export interface ProjectBillingCloseGateway {
  /**
   * 削除するプロジェクトの購読を即時解約し、以後の新規購読を拒否する。返金はしない。
   * 何度呼んでもよい。失敗は throw で表す。
   */
  closeProjectBilling(input: { projectId: string }): Promise<void>;
}
