export const projectListContentJa = {
  projectListContent: {
    loading: "プロジェクトを読み込み中...",
    empty: {
      title: "プロジェクトがまだありません",
      description:
        "最初のプロジェクトを作成して、ストーリー管理を始めましょう。",
      action: "プロジェクトを作成",
    },
    participateOnly: {
      title: "参加しているプロジェクトがありません",
      proGuidance:
        "無料プランではプロジェクトを作成できません。プロジェクトを作成するには Pro プランが必要です。",
      inviteGuidance:
        "既存のプロジェクトに参加するには、プロジェクトのオーナーに招待リンクの発行を依頼してください。受け取った招待リンクを開くと参加できます。",
    },
  },
} as const;

export const projectListContentEn = {
  projectListContent: {
    loading: "Loading projects...",
    empty: {
      title: "No projects yet",
      description: "Create your first project to start managing stories.",
      action: "Create project",
    },
    participateOnly: {
      title: "You have not joined any projects yet",
      proGuidance:
        "The free plan cannot create projects. Creating a project requires the Pro plan.",
      inviteGuidance:
        "To join an existing project, ask its owner for an invitation link, then open the link you receive.",
    },
  },
} as const;
