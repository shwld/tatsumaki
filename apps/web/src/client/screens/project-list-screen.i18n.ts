export const projectListScreenJa = {
  projectListScreen: {
    loadError: "プロジェクト一覧の読み込みに失敗しました",
    permission: {
      nextAction:
        "プロジェクト一覧の閲覧権限を申請するか、管理者に必要なプロジェクトへの追加を依頼してください。",
      retryHint:
        "現在の画面にとどまったまま、プロジェクト一覧の取得を再試行できます。",
      retry: "プロジェクト一覧を再読み込み",
    },
    title: "プロジェクト",
    newProject: "新規プロジェクト",
  },
} as const;

export const projectListScreenEn = {
  projectListScreen: {
    loadError: "Failed to load projects",
    permission: {
      nextAction:
        "Request permission to view the project list, or ask an administrator to add you to the required project.",
      retryHint:
        "You can retry loading the project list while staying on this screen.",
      retry: "Reload project list",
    },
    title: "Projects",
    newProject: "New project",
  },
} as const;
