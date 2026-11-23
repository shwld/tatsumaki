export const ownershipTransferSectionJa = {
  ownershipTransferSection: {
    title: "所有権の譲渡",
    loading: "譲渡の状況を読み込み中...",
    error: "譲渡の状況を取得できません。",
    retry: "再取得",
    description:
      "このプロジェクトの購読を支払っているオーナーは、既存のメンバーに所有権の引き継ぎを申請できます。申請しただけでは、権限も購読も変わりません。",
    confirmNotice:
      "相手が同じプロジェクトを購読すると、あなたの購読は終了します。申請は 7 日で失効し、相手が決済を確定するまで取り消せます。",
    recipientLabel: "譲渡先のメンバー",
    recipientPlaceholder: "メンバーを選択",
    noCandidates: "譲渡先にできる他のメンバーがいません。",
    submit: "譲渡を申請する",
    unknownMember: "不明なメンバー",
    requester: {
      status: "{{name}} さんに所有権の譲渡を申請中です。",
      next: "相手が購読を完了するまで、あなたがオーナーのままです。",
      cancel: "申請を取り消す",
    },
    recipient: {
      status: "{{name}} さんから所有権の譲渡を申請されています。",
      next: "購読して引き継ぐ手順は、次の段階で案内します。引き継がない場合は辞退できます。",
      decline: "辞退する",
    },
    expiresAt: "有効期限: {{date}}",
    errors: {
      generic: "操作できませんでした。時間をおいてもう一度お試しください。",
      noSubscription:
        "このプロジェクトの購読の支払者ではないか、購読が有効ではないため、申請できません。",
      alreadyPending: "すでに有効な譲渡の申請があります。",
      invalidRecipient: "このメンバーには譲渡できません。",
      notPending: "申請はすでに終了しています。最新の状態を表示します。",
    },
  },
} as const;

export const ownershipTransferSectionEn = {
  ownershipTransferSection: {
    title: "Ownership transfer",
    loading: "Loading transfer status...",
    error: "Could not load the transfer status.",
    retry: "Retry",
    description:
      "The owner who pays for this project's subscription can ask an existing member to take over ownership. Asking does not change any permission or the subscription.",
    confirmNotice:
      "Your subscription ends once the member subscribes to this project. The request expires in 7 days and can be cancelled until the member completes payment.",
    recipientLabel: "Member to transfer to",
    recipientPlaceholder: "Select a member",
    noCandidates: "There is no other member to transfer to.",
    submit: "Request transfer",
    unknownMember: "Unknown member",
    requester: {
      status: "You asked {{name}} to take over ownership.",
      next: "You remain the owner until they complete the subscription.",
      cancel: "Cancel request",
    },
    recipient: {
      status: "{{name}} asked you to take over ownership.",
      next: "Steps to subscribe and take over will be provided in the next stage. You can decline if you do not want to.",
      decline: "Decline",
    },
    expiresAt: "Expires: {{date}}",
    errors: {
      generic: "The action failed. Please try again in a moment.",
      noSubscription:
        "You do not pay for this project's subscription, or it is not active, so you cannot request a transfer.",
      alreadyPending: "A transfer request is already pending.",
      invalidRecipient: "Ownership cannot be transferred to this member.",
      notPending: "The request has already ended. Showing the latest state.",
    },
  },
} as const;
