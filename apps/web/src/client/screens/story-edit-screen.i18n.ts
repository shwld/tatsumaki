export const storyEditScreenJa = {
  storyEditScreen: {
    errors: {
      forbidden: "このストーリーを編集する権限がありません。",
      notFound: "ストーリーが見つかりません",
      loadFailed: "ストーリーの読み込みに失敗しました。再試行してください。",
      deleteFailed: "ストーリーの削除に失敗しました",
      deleteFailedWithMessage: "ストーリーの削除に失敗しました: {{message}}",
      deleteRetry: "ストーリーの削除に失敗しました。再度お試しください。",
    },
    toast: {
      deleted: "「{{title}}」を削除しました",
    },
    permission: {
      nextAction:
        "このストーリーの編集権限を申請するか、管理者に変更や削除の代行を依頼してください。",
      retryHint: "同じストーリーで再試行できます。",
    },
    title: "ストーリーを編集",
    backToStories: "ストーリー一覧へ戻る",
    description:
      "パネル一覧でストーリーを開いたときと同じ内容を編集できます（タイトル・種別・ステータス・ポイント・説明・コメントなど）。",
    loading: "ストーリーを読み込み中です...",
  },
} as const;

export const storyEditScreenEn = {
  storyEditScreen: {
    errors: {
      forbidden: "You do not have permission to edit this story.",
      notFound: "Story not found",
      loadFailed: "Failed to load the story. Please try again.",
      deleteFailed: "Failed to delete story",
      deleteFailedWithMessage: "Failed to delete story: {{message}}",
      deleteRetry: "Failed to delete story. Please try again.",
    },
    toast: {
      deleted: 'Deleted "{{title}}"',
    },
    permission: {
      nextAction:
        "Request permission to edit this story, or ask an administrator to make changes or delete it.",
      retryHint: "You can retry with the same story.",
    },
    title: "Edit story",
    backToStories: "Back to stories",
    description:
      "Edit the same content available when opening a story from the panels, including title, type, status, points, description, and comments.",
    loading: "Loading story...",
  },
} as const;
