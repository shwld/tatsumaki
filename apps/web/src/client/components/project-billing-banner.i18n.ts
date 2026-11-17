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
      resumeSoon: "プロジェクトの再開機能は準備中です。",
    },
    unknown: {
      message:
        "プロジェクトの状態を確認できないため、編集を一時的に停止しています。閲覧は続けられます。",
      retry: "再試行",
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
      resumeSoon: "Resuming a project is coming soon.",
    },
    unknown: {
      message:
        "The project state could not be confirmed, so editing is paused for now. You can keep viewing.",
      retry: "Retry",
    },
    manage: "Manage payment",
    portalError: "Could not start the request. Please try again in a moment.",
  },
} as const;
