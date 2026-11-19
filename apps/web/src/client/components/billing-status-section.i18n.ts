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
    subscriptions: {
      title: "所有プロジェクトの購読",
      loading: "購読状況を読み込み中...",
      error: "購読状況を取得できません。",
      retry: "再取得",
      empty: "所有しているプロジェクトはありません。",
      noSubscription: "購読なし",
      state: {
        active: "利用中",
        grace: "支払い猶予中",
        suspended: "停止中",
      },
      nextBilling: "次回請求",
      nextBillingNone: "なし",
      nextBillingUnavailable: "取得できません",
      endsAt: "終了予定日",
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
    subscriptions: {
      title: "Subscriptions for projects you own",
      loading: "Loading subscriptions...",
      error: "Could not load subscriptions.",
      retry: "Retry",
      empty: "You do not own any projects.",
      noSubscription: "No subscription",
      state: {
        active: "Active",
        grace: "Grace period",
        suspended: "Suspended",
      },
      nextBilling: "Next billing",
      nextBillingNone: "None",
      nextBillingUnavailable: "Unavailable",
      endsAt: "Ends on",
    },
    guidance: {
      selfHosted: "This service has no usage limits.",
      perProject:
        "Each project runs on its own monthly subscription. Manage payment methods and cancellations for your subscribed projects from payment management.",
    },
  },
} as const;
