export const projectUsageJa = {
  projectUsage: {
    title: "利用状態",
    loading: "利用状態を読み込み中...",
    error: "利用状態を取得できません。",
    retry: "再取得",
    state: {
      available: "利用できます",
      limited: "{{until}} まで利用できます",
      readOnly: "閲覧のみ",
      unknown: "利用状態を確認できません",
    },
    deadline: {
      ending: "この日時で利用が終了し、閲覧のみになります。",
      action_required:
        "期限までに手続きすると利用を続けられます。過ぎると閲覧のみになります。",
    },
    operation: {
      resume: "利用を再開",
      resolve: "利用を続ける手続き",
      stop: "利用を終了",
      manage: "管理",
    },
    operationFor: "{{name}}: {{operation}}",
    accountManage: "アカウント全体の管理",
    operationsUnavailable: "利用できる操作を取得できません。",
    operationFailed:
      "処理を開始できませんでした。時間をおいてもう一度お試しください。",
    returned:
      "外部の画面から戻りました。手続きを完了した場合、反映まで時間がかかることがあります。",
    owned: "所有するプロジェクト",
    empty: "所有しているプロジェクトはありません。",
    selfHosted: "このサービスには利用上限がありません。",
    modeUnavailable:
      "利用状態を一時的に取得できません。時間をおいて再読み込みしてください。",
    banner: {
      readOnlyTitle: "閲覧のみ",
      readOnlyMember:
        "このプロジェクトは閲覧のみ可能です。利用の再開はプロジェクトのオーナーが行います。",
      readOnlyOwner: "このプロジェクトは閲覧のみ可能です。",
      unknown:
        "プロジェクトの状態を確認できないため、編集を一時的に停止しています。閲覧は続けられます。",
      retry: "再試行",
      resumeWaiting:
        "手続きの反映を待っています。反映されるまで編集はできません。このままお待ちください。",
      resumeDelayed:
        "反映に時間がかかっています。編集は反映後に自動で再開されます。しばらくしてからこのページを再読み込みしてください。",
      resumeCanceled:
        "手続きは完了していません。必要なときにもう一度お試しください。",
    },
  },
} as const;

export const projectUsageEn = {
  projectUsage: {
    title: "Usage",
    loading: "Loading usage...",
    error: "Could not load the usage state.",
    retry: "Retry",
    state: {
      available: "Available",
      limited: "Available until {{until}}",
      readOnly: "View only",
      unknown: "The usage state could not be confirmed",
    },
    deadline: {
      ending: "Usage ends at this time and the project becomes view only.",
      action_required:
        "Take action before the deadline to keep using the project. After it, the project becomes view only.",
    },
    operation: {
      resume: "Resume usage",
      resolve: "Take action to keep using",
      stop: "End usage",
      manage: "Manage",
    },
    operationFor: "{{name}}: {{operation}}",
    accountManage: "Manage your account",
    operationsUnavailable: "Could not load the available operations.",
    operationFailed:
      "Could not start the request. Please try again in a moment.",
    returned:
      "You returned from the external page. If you completed the steps, it may take a moment to appear.",
    owned: "Projects you own",
    empty: "You do not own any projects.",
    selfHosted: "This service has no usage limits.",
    modeUnavailable:
      "The usage state is temporarily unavailable. Please reload in a moment.",
    banner: {
      readOnlyTitle: "View only",
      readOnlyMember:
        "This project is view only. The project owner can resume it.",
      readOnlyOwner: "This project is view only.",
      unknown:
        "The project state could not be confirmed, so editing is paused for now. You can keep viewing.",
      retry: "Retry",
      resumeWaiting:
        "Waiting for the change to be confirmed. Editing stays off until it is. Please wait.",
      resumeDelayed:
        "Confirmation is taking longer than usual. Editing resumes automatically once it is confirmed. Please reload this page in a little while.",
      resumeCanceled:
        "The steps were not completed. You can try again whenever you are ready.",
    },
  },
} as const;
