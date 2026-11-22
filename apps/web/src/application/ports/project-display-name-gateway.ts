export interface ProjectDisplayNameGateway {
  /**
   * 決済事業者側の購読の表示名をプロジェクト名に合わせる。冪等で、何度呼んでもよい。
   * 名前は表示用で、購読の識別は projectId が担う。失敗は throw で表す。
   */
  syncProjectDisplayNames(input: {
    billingAccountId: string;
    projects: { projectId: string; name: string }[];
  }): Promise<void>;
}
