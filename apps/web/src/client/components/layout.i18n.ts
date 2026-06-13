export const layoutJa = {
  app: {
    name: "tatsumaki",
  },
  layout: {
    notifications: {
      label: "通知",
      close: "閉じる",
      loading: "読み込み中...",
      empty: "新しい通知はありません。",
      loadError: "通知一覧の読み込みに失敗しました",
      fallbackInvitationTitle: "招待を確認する",
      kind: {
        statusChanged: "ステータス変更",
        estimateChanged: "見積もり変更",
        commentAdded: "コメント",
        mention: "メンション",
        memberInvitation: "招待",
        storyActivity: "ストーリー更新",
      },
    },
    menu: {
      userMenu: "ユーザーメニュー",
      theme: "テーマ",
      themeLight: "ライト",
      themeDark: "ダーク",
      themeSystem: "システム",
      account: "アカウント",
      logout: "ログアウト",
    },
    language: {
      label: "言語",
      ja: "日本語",
      en: "English",
    },
  },
} as const;

export const layoutEn = {
  app: {
    name: "tatsumaki",
  },
  layout: {
    notifications: {
      label: "Notifications",
      close: "Close",
      loading: "Loading...",
      empty: "No new notifications.",
      loadError: "Failed to load notifications",
      fallbackInvitationTitle: "Review invitation",
      kind: {
        statusChanged: "Status change",
        estimateChanged: "Estimate change",
        commentAdded: "Comment",
        mention: "Mention",
        memberInvitation: "Invitation",
        storyActivity: "Story update",
      },
    },
    menu: {
      userMenu: "User menu",
      theme: "Theme",
      themeLight: "Light",
      themeDark: "Dark",
      themeSystem: "System",
      account: "Account",
      logout: "Logout",
    },
    language: {
      label: "Language",
      ja: "日本語",
      en: "English",
    },
  },
} as const;
