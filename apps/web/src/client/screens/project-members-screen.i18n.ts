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
      linkDescription:
        "宛先を指定せず、最初に開いた1人だけが使える招待リンクを作成します。",
      creatingLink: "リンクを作成中...",
      createLink: "1回限りの招待リンクを作成",
      createdLink: "作成した招待リンク",
      copyLink: "コピー",
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
      singleUse: "1回限りのリンク",
      revoke: "リンクを無効化",
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
      linkDescription:
        "Create a link that can be used by the first person who opens it.",
      creatingLink: "Creating link...",
      createLink: "Create one-time invite link",
      createdLink: "Created invitation link",
      copyLink: "Copy",
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
      singleUse: "One-time link",
      revoke: "Revoke link",
    },
  },
} as const;
