export const permissionDeniedJa = {
  permissionDenied: {
    status: "403 Forbidden",
    title: "権限が不足しています",
    defaultMessage: "この操作を実行する権限がありません。",
    nextActionTitle: "次にできること",
    defaultNextAction:
      "必要な権限を申請するか、管理者にこの操作の代行を依頼してください。",
    defaultRetryHint:
      "権限が反映されたら、現在の文脈を維持したまま再試行できます。",
    retry: "権限を確認して再試行",
    backToProjects: "プロジェクト一覧へ戻る",
  },
} as const;

export const permissionDeniedEn = {
  permissionDenied: {
    status: "403 Forbidden",
    title: "Permission required",
    defaultMessage: "You do not have permission to perform this action.",
    nextActionTitle: "What you can do next",
    defaultNextAction:
      "Request the required permission or ask an administrator to perform this action for you.",
    defaultRetryHint:
      "After the permission is updated, you can retry without leaving this context.",
    retry: "Check permission and retry",
    backToProjects: "Back to projects",
  },
} as const;
