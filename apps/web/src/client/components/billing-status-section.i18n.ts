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
    portalScope:
      "支払い方法の更新と請求書・領収書の確認は、あなたの所有する全プロジェクトの支払いをまとめて扱う決済画面で行います。プランや数量の変更はできません。",
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
      cancel: {
        button: "期間末に解約",
        buttonFor: "{{name}} の購読を期間末に解約",
        returned:
          "決済画面から戻りました。解約を確定した場合、終了予定日が表示されます。表示まで時間がかかることがあります。確定せず戻った場合は何も変わりません。",
        error:
          "解約の確認画面を開けませんでした。時間をおいてもう一度お試しください。",
        stale: "購読の状態が変わっていました。最新の状態を表示しています。",
      },
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
    portalScope:
      "Update payment methods and view invoices and receipts on the payment page. This covers the payments for all projects you own together. Plans and quantities cannot be changed there.",
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
      cancel: {
        button: "Cancel at period end",
        buttonFor: "Cancel the subscription for {{name}} at the period end",
        returned:
          "You returned from the payment page. If you confirmed the cancellation, the end date appears here; it may take a moment. If you went back without confirming, nothing changed.",
        error:
          "Could not open the cancellation confirmation. Please try again in a moment.",
        stale: "The subscription state had changed. Showing the latest state.",
      },
    },
    guidance: {
      selfHosted: "This service has no usage limits.",
      perProject:
        "Each project runs on its own monthly subscription. Manage payment methods and cancellations for your subscribed projects from payment management.",
    },
  },
} as const;
