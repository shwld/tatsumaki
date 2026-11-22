export const projectSubscriptionSectionJa = {
  projectSubscriptionSection: {
    title: "購読",
    loading: "購読状況を読み込み中...",
    error: "購読状況を取得できません。",
    retry: "再取得",
    noSubscription: "このプロジェクトに有効な購読はありません。",
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
      returned:
        "決済画面から戻りました。解約を確定した場合、終了予定日が表示されます。表示まで時間がかかることがあります。確定せず戻った場合は何も変わりません。",
      error:
        "解約の確認画面を開けませんでした。時間をおいてもう一度お試しください。",
      stale: "購読の状態が変わっていました。最新の状態を表示しています。",
    },
    paymentMethod: {
      button: "支払い方法を更新",
      scope:
        "支払い方法はあなたの所有する全プロジェクトの購読の支払いに使われます。このプロジェクトだけ別のカードにはできません。",
      returned:
        "決済画面から戻りました。支払い方法を更新した場合、次回以降の請求に使われます。",
      error:
        "支払い方法の更新画面を開けませんでした。時間をおいてもう一度お試しください。",
    },
  },
} as const;

export const projectSubscriptionSectionEn = {
  projectSubscriptionSection: {
    title: "Subscription",
    loading: "Loading subscription...",
    error: "Could not load the subscription.",
    retry: "Retry",
    noSubscription: "This project has no active subscription.",
    state: {
      active: "Active",
      grace: "Payment grace period",
      suspended: "Suspended",
    },
    nextBilling: "Next billing",
    nextBillingNone: "None",
    nextBillingUnavailable: "Unavailable",
    endsAt: "Ends on",
    cancel: {
      button: "Cancel at period end",
      returned:
        "You returned from the payment page. If you confirmed the cancellation, the end date is shown here; it may take a moment to appear. If you did not confirm, nothing changed.",
      error:
        "Could not open the cancellation confirmation. Please try again in a moment.",
      stale: "The subscription state had changed. Showing the latest state.",
    },
    paymentMethod: {
      button: "Update payment method",
      scope:
        "The payment method is used for the subscriptions of all projects you own. It cannot be set for this project alone.",
      returned:
        "You returned from the payment page. If you updated the payment method, it is used for upcoming charges.",
      error:
        "Could not open the payment method update. Please try again in a moment.",
    },
  },
} as const;
