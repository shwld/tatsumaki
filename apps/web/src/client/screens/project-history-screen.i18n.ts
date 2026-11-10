export const projectHistoryScreenJa = {
  projectHistoryScreen: {
    title: "Project History",
    loading: "読み込み中...",
    loadError: "プロジェクト履歴の取得に失敗しました",
    empty: "まだ操作履歴がありません。",
    loadMore: "さらに表示",
    quoted: "「{{value}}」",
    columns: {
      date: "日時",
      actor: "操作者",
      action: "操作",
      story: "ストーリー",
      change: "変更内容",
    },
    actions: {
      created: "作成",
      deleted: "削除",
      fieldChanged: "{{field}} を変更",
    },
    fields: {
      title: "タイトル",
      description: "説明",
      type: "タイプ",
      status: "ステータス",
      storyPoint: "ポイント",
      labels: "ラベル",
      story: "ストーリー",
    },
  },
} as const;

export const projectHistoryScreenEn = {
  projectHistoryScreen: {
    title: "Project History",
    loading: "Loading...",
    loadError: "Failed to load project history",
    empty: "There is no activity history yet.",
    loadMore: "Show more",
    quoted: '"{{value}}"',
    columns: {
      date: "Date",
      actor: "Actor",
      action: "Action",
      story: "Story",
      change: "Changes",
    },
    actions: {
      created: "Created",
      deleted: "Deleted",
      fieldChanged: "Changed {{field}}",
    },
    fields: {
      title: "Title",
      description: "Description",
      type: "Type",
      status: "Status",
      storyPoint: "Points",
      labels: "Labels",
      story: "Story",
    },
  },
} as const;
