export const projectVelocityScreenJa = {
  projectVelocityScreen: {
    title: "ベロシティダッシュボード",
    backToStories: "ストーリーへ戻る",
    description:
      "完了済みイテレーションの実績ポイントから、直近3スプリントの平均ベロシティを確認します。",
    iterationRange: "{{start}} 〜 {{end}}",
    projectNotFound: "プロジェクトが見つかりません",
    loadError: "ベロシティの取得に失敗しました",
    loading: "読み込み中...",
    stats: {
      recentAverage: "直近3スプリント平均",
      completedSprints: "完了スプリント数",
      totalCompletedPoints: "累計完了ポイント",
    },
    summary: {
      title: "スプリント進捗サマリー",
      completedPoints: "完了ポイント",
      incompleteCount: "未完了件数",
      completionRate: "達成率",
      countUnit: "{{count}} 件",
    },
    progressChartTitle: "進捗チャート（現在イテレーション）",
    history: {
      title: "過去スプリント実績",
      empty:
        "まだ完了したイテレーションがありません。完了後に実績がここへ表示されます。",
      period: "期間",
      completedPoints: "完了ポイント",
    },
    trend: {
      title: "ベロシティ推移",
      empty: "推移グラフは、完了したスプリントができると表示されます。",
      chartLabel: "ベロシティ推移チャート",
    },
  },
} as const;

export const projectVelocityScreenEn = {
  projectVelocityScreen: {
    title: "Velocity dashboard",
    backToStories: "Back to stories",
    description:
      "Check the average velocity of the last 3 sprints, based on points completed in finished iterations.",
    iterationRange: "{{start}} – {{end}}",
    projectNotFound: "Project not found",
    loadError: "Failed to load velocity",
    loading: "Loading...",
    stats: {
      recentAverage: "Average of last 3 sprints",
      completedSprints: "Completed sprints",
      totalCompletedPoints: "Total completed points",
    },
    summary: {
      title: "Sprint progress summary",
      completedPoints: "Completed points",
      incompleteCount: "Incomplete stories",
      completionRate: "Completion rate",
      countUnit: "{{count}}",
    },
    progressChartTitle: "Progress chart (current iteration)",
    history: {
      title: "Past sprint results",
      empty:
        "No iterations have been completed yet. Results will appear here once they are.",
      period: "Period",
      completedPoints: "Completed points",
    },
    trend: {
      title: "Velocity trend",
      empty: "The trend chart appears once a sprint has been completed.",
      chartLabel: "Velocity trend chart",
    },
  },
} as const;
