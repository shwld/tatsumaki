export const projectBillingBannerJa = {
  projectBillingBanner: {
    grace: {
      owner:
        "支払いに失敗しています。{{until}} までに支払い方法を更新しないと、プロジェクトは停止中（閲覧のみ）になります。それまでは通常どおり編集できます。",
      ownerNoDate:
        "支払いに失敗しています。支払い方法を更新しないと、プロジェクトは停止中（閲覧のみ）になります。",
    },
    suspended: {
      title: "停止中・閲覧のみ",
      member:
        "このプロジェクトは停止中のため、閲覧のみ可能です。再開はプロジェクトのオーナーが行います。",
      owner:
        "このプロジェクトは停止中のため、閲覧のみ可能です。支払い方法を確認してください。",
    },
    unknown: {
      message:
        "プロジェクトの状態を確認できないため、編集を一時的に停止しています。閲覧は続けられます。",
      retry: "再試行",
    },
    resume: {
      button: "プロジェクトを再開",
      waiting:
        "お支払いの反映を待っています。反映されるまで編集はできません。このままお待ちください。",
      delayed:
        "反映に時間がかかっています。編集は反映後に自動で再開されます。しばらくしてからこのページを再読み込みしてください。",
      canceled:
        "お手続きは完了していません。必要なときにもう一度お試しください。",
      paymentAction:
        "このプロジェクトには支払いの確認が必要な購読があります。新しく購入せず、支払いを管理から支払い方法を更新してください。",
      checkoutDisabled:
        "現在、新しい購読の開始を受け付けていません。支払いの確認が必要な場合は、支払いを管理からお手続きください。",
    },
    manage: "支払いを管理",
    portalError:
      "処理を開始できませんでした。時間をおいてもう一度お試しください。",
  },
} as const;

export const projectBillingBannerEn = {
  projectBillingBanner: {
    grace: {
      owner:
        "Payment failed. Update your payment method by {{until}} or the project becomes suspended (view only). You can keep editing until then.",
      ownerNoDate:
        "Payment failed. Update your payment method or the project becomes suspended (view only).",
    },
    suspended: {
      title: "Suspended — view only",
      member:
        "This project is suspended and view only. The project owner can resume it.",
      owner:
        "This project is suspended and view only. Please check your payment method.",
    },
    unknown: {
      message:
        "The project state could not be confirmed, so editing is paused for now. You can keep viewing.",
      retry: "Retry",
    },
    resume: {
      button: "Resume project",
      waiting:
        "Waiting for your payment to be confirmed. Editing stays off until it is. Please wait.",
      delayed:
        "Confirmation is taking longer than usual. Editing resumes automatically once it is confirmed. Please reload this page in a little while.",
      canceled:
        "The checkout was not completed. You can try again whenever you are ready.",
      paymentAction:
        "This project has a subscription that needs a payment fix. Use Manage payment to update your payment method instead of buying again.",
      checkoutDisabled:
        "New subscriptions are not being accepted right now. If a payment needs attention, use Manage payment.",
    },
    manage: "Manage payment",
    portalError: "Could not start the request. Please try again in a moment.",
  },
} as const;
