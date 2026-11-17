export const billingStatusSectionJa = {
  billingStatusSection: {
    title: "お支払い",
    loading: "お支払い情報を読み込み中...",
    unavailable:
      "お支払い情報を一時的に取得できません。時間をおいて再読み込みしてください。",
    actions: {
      manage: "支払いを管理",
      error: "処理を開始できませんでした。時間をおいてもう一度お試しください。",
    },
    guidance: {
      selfHosted: "このサービスには利用上限がありません。",
      perProject:
        "プロジェクトごとに月額の購読で利用します。購読中のプロジェクトの支払い方法や解約は、支払い管理から行えます。",
    },
  },
} as const;

export const billingStatusSectionEn = {
  billingStatusSection: {
    title: "Billing",
    loading: "Loading billing...",
    unavailable:
      "Billing information is temporarily unavailable. Please reload in a moment.",
    actions: {
      manage: "Manage payment",
      error: "Could not start the request. Please try again in a moment.",
    },
    guidance: {
      selfHosted: "This service has no usage limits.",
      perProject:
        "Each project runs on its own monthly subscription. Manage payment methods and cancellations for your subscribed projects from payment management.",
    },
  },
} as const;
