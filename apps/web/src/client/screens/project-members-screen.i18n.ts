export const projectMembersScreenJa = {
  projectMembersScreen: {
    missingProjectId: "プロジェクトIDが見つかりません",
    loadError: "プロジェクトメンバーの読み込みに失敗しました",
    validation: {
      singleTarget:
        "メールアドレスまたはユーザーIDのどちらか一方を入力してください",
    },
    invitationError: "招待の作成に失敗しました",
    roleUpdateError: "メンバー権限の更新に失敗しました",
    breadcrumb: "メンバー",
    title: "プロジェクトメンバー",
    loading: "メンバーを読み込み中...",
    invite: {
      title: "メンバーを招待",
      description:
        "メールアドレスまたはユーザーIDで招待し、ロールを割り当てます。",
      email: "メールアドレス",
      userId: "ユーザーID",
      role: "ロール",
      inviting: "招待中...",
      send: "招待を送信",
    },
    members: {
      title: "メンバー",
      empty: "メンバーはまだいません。",
      joined: "参加日時: {{date}}",
    },
    invitations: {
      title: "招待",
      empty: "招待はまだありません。",
      target: "対象: {{target}}",
      metadata: "ロール: {{role}} / ステータス: {{status}}",
      expires: "有効期限: {{date}}",
    },
  },
} as const;

export const projectMembersScreenEn = {
  projectMembersScreen: {
    missingProjectId: "Project ID is missing",
    loadError: "Failed to load project members",
    validation: {
      singleTarget: "Provide either email or user ID",
    },
    invitationError: "Failed to create invitation",
    roleUpdateError: "Failed to update member role",
    breadcrumb: "Members",
    title: "Project members",
    loading: "Loading members...",
    invite: {
      title: "Invite member",
      description: "Invite by email address or user ID, then assign a role.",
      email: "Email address",
      userId: "User ID",
      role: "Role",
      inviting: "Inviting...",
      send: "Send invitation",
    },
    members: {
      title: "Members",
      empty: "No members yet.",
      joined: "Joined: {{date}}",
    },
    invitations: {
      title: "Invitations",
      empty: "No invitations yet.",
      target: "Target: {{target}}",
      metadata: "Role: {{role}} / Status: {{status}}",
      expires: "Expires: {{date}}",
    },
  },
} as const;
