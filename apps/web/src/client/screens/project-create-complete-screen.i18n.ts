export const projectCreateCompleteScreenJa = {
  projectCreateCompleteScreen: {
    title: "プロジェクトを作成しています",
    waiting: "お支払いの反映を確認しています...",
    closeNotice: "このページを閉じても作成は続きます。",
    delayed:
      "お支払いの反映に時間がかかっています。しばらくしてから「もう一度確認」を押してください。",
    grace:
      "お支払いを確認できていません。支払い方法を確認のうえ、もう一度お試しください。",
    error:
      "プロジェクトを作成できませんでした。時間をおいてもう一度お試しください。",
    notFound:
      "作成の依頼が見つかりません。プロジェクト作成からやり直してください。",
    retry: "もう一度確認",
    backToCreate: "プロジェクト作成へ戻る",
  },
} as const;

export const projectCreateCompleteScreenEn = {
  projectCreateCompleteScreen: {
    title: "Creating your project",
    waiting: "Confirming your payment...",
    closeNotice: "Creation continues even if you close this page.",
    delayed:
      "Your payment is taking longer than expected to apply. Please try again in a moment.",
    grace:
      "We could not confirm your payment. Please check your payment method and try again.",
    error: "Could not create the project. Please try again in a moment.",
    notFound:
      "This creation request was not found. Please start again from project creation.",
    retry: "Check again",
    backToCreate: "Back to project creation",
  },
} as const;
