export const iterationProgressChartJa = {
  iterationProgressChart: {
    scopeAdded: "+{{points}} pt 追加",
    scopeRemoved: "{{points}} pt 削除",
    baselineNote:
      "スプリント開始時スコープ基準の残ポイント: {{points}} pt（初回記録または現在の総見積もり）",
    futureNote: "注: 未来日の実績線は未確定のため表示されません。",
    tablistLabel: "進捗チャート切替",
    burndown: "バーンダウン",
    burnup: "バーンアップ",
    burndownChartLabel: "バーンダウンチャート（理想線と実績線）",
    burnupChartLabel: "バーンアップチャート（完了ポイントとスコープ合計）",
    idealLine: "理想線",
    actualLine: "実績線（残ポイント）",
  },
} as const;

export const iterationProgressChartEn = {
  iterationProgressChart: {
    scopeAdded: "+{{points}} pt added",
    scopeRemoved: "{{points}} pt removed",
    baselineNote:
      "Remaining points based on the scope at sprint start: {{points}} pt (first recorded or current total estimate)",
    futureNote: "Note: the actual line is not shown for future dates.",
    tablistLabel: "Switch progress chart",
    burndown: "Burndown",
    burnup: "Burnup",
    burndownChartLabel: "Burndown chart (ideal and actual lines)",
    burnupChartLabel: "Burnup chart (accepted points and total scope)",
    idealLine: "Ideal line",
    actualLine: "Actual line (remaining points)",
  },
} as const;
