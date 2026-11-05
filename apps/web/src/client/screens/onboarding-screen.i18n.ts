export const onboardingScreenJa = {
  onboardingScreen: {
    title: "tatsumaki へようこそ",
    description:
      "利用を開始するには、bot でないことの確認と規約への同意が必要です。",
    account: "ログイン中のアカウント: {{email}}",
    terms: "利用規約とプライバシーポリシーに同意します",
    submit: "利用を開始する",
    submitting: "処理しています...",
    loadError: "オンボーディング情報の読み込みに失敗しました",
    retry: "再試行",
    challengeFailed: "bot 確認に失敗しました。もう一度お試しください。",
    termsRequired: "利用規約への同意が必要です。",
    unavailable:
      "現在登録を受け付けていません。時間をおいてもう一度お試しください。",
    submitError: "利用開始の処理に失敗しました。",
    widgetError: "bot 確認を読み込めませんでした。",
    widgetRetry: "再読み込み",
  },
} as const;

export const onboardingScreenEn = {
  onboardingScreen: {
    title: "Welcome to tatsumaki",
    description:
      "To get started, confirm you are not a bot and accept the terms.",
    account: "Signed in as {{email}}",
    terms: "I accept the terms of service and the privacy policy",
    submit: "Get started",
    submitting: "Working...",
    loadError: "Failed to load onboarding",
    retry: "Retry",
    challengeFailed: "Bot verification failed. Please try again.",
    termsRequired: "You need to accept the terms.",
    unavailable: "Registration is unavailable right now. Please try later.",
    submitError: "Failed to complete onboarding.",
    widgetError: "Could not load the bot verification.",
    widgetRetry: "Reload",
  },
} as const;
