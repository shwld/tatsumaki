export const projectCreateScreenJa = {
  projectCreateScreen: {
    validation: {
      nameRequired: "プロジェクト名は必須です",
    },
    requestError: "プロジェクトの作成に失敗しました",
    permission: {
      nextAction: "プロジェクトOwnerに招待を依頼してください。",
      retryHint: "入力中のプロジェクト名を保持したまま再試行できます。",
      retry: "入力内容を保持して再試行",
    },
    title: "プロジェクトを作成",
    projects: "プロジェクト",
    description:
      "スプリント計画を始めるために、プロジェクト名を入力してください。",
  },
} as const;

export const projectCreateScreenEn = {
  projectCreateScreen: {
    validation: {
      nameRequired: "Project name is required",
    },
    requestError: "Failed to create project",
    permission: {
      nextAction: "Ask a project owner to invite you.",
      retryHint: "You can retry while keeping the project name you entered.",
      retry: "Retry with current input",
    },
    title: "Create project",
    projects: "Projects",
    description: "Enter a project name to start planning your sprint.",
  },
} as const;
