export const billingStatusSectionJa = {
  billingStatusSection: {
    title: "プランと利用状況",
    loading: "プラン情報を読み込み中...",
    unavailable:
      "プラン情報を一時的に取得できません。時間をおいて再読み込みしてください。",
    plan: {
      label: "プラン",
      free: "Free",
      pro: "Pro",
      unlimited: "Unlimited",
    },
    state: {
      label: "状態",
      active: "有効",
      grace: "支払い猶予中",
      restricted: "制限中",
    },
    maxOwnedProjects: {
      label: "作成できるプロジェクト数",
      unlimited: "上限なし",
      count: "{{count}} 件",
    },
    validUntil: "期限",
    guidance: {
      freeActive:
        "Free プランではプロジェクトへの参加のみ可能です。プロジェクトを作成するには Pro が必要です。",
      proActive: "Pro プランをご利用中です。",
      unlimitedActive: "このサービスには利用上限がありません。",
      grace:
        "支払いを確認できていません。{{validUntil}} までに解消されない場合、プロジェクトの作成が制限されます。オーナーとしての権限と既存データの編集は引き続き可能です。",
      graceNoDate:
        "支払いを確認できていません。解消されない場合、プロジェクトの作成が制限されます。オーナーとしての権限と既存データの編集は引き続き可能です。",
      restricted:
        "現在プロジェクトを新規作成できません。支払いを再開すると作成できるようになります。オーナーとしての権限と既存データの編集は引き続き可能です。",
    },
  },
} as const;

export const billingStatusSectionEn = {
  billingStatusSection: {
    title: "Plan and usage",
    loading: "Loading plan...",
    unavailable:
      "Plan information is temporarily unavailable. Please reload in a moment.",
    plan: {
      label: "Plan",
      free: "Free",
      pro: "Pro",
      unlimited: "Unlimited",
    },
    state: {
      label: "Status",
      active: "Active",
      grace: "Payment grace period",
      restricted: "Restricted",
    },
    maxOwnedProjects: {
      label: "Projects you can own",
      unlimited: "Unlimited",
      count: "{{count}}",
    },
    validUntil: "Valid until",
    guidance: {
      freeActive:
        "The Free plan can only join projects. Creating projects requires Pro.",
      proActive: "You are on the Pro plan.",
      unlimitedActive: "This service has no usage limits.",
      grace:
        "We could not confirm your payment. Creating projects will be restricted unless it is resolved by {{validUntil}}. You remain an owner and can keep editing existing data.",
      graceNoDate:
        "We could not confirm your payment. Creating projects will be restricted unless it is resolved. You remain an owner and can keep editing existing data.",
      restricted:
        "You cannot create new projects right now. Resume payment to create projects again. You remain an owner and can keep editing existing data.",
    },
  },
} as const;
