export const ownershipTransferSectionJa = {
  ownershipTransferSection: {
    title: "所有権の譲渡",
    loading: "譲渡の状況を読み込み中...",
    error: "譲渡の状況を取得できません。",
    retry: "再取得",
    description:
      "オーナーは既存のメンバーに所有権の引き継ぎを申請できます。申請しただけでは権限は変わりません。",
    confirmNotice:
      "受け手が所有できる状態になると、所有権が切り替わります。申請は 7 日で失効し、切り替わるまで取り消せます。",
    recipientLabel: "譲渡先のメンバー",
    recipientPlaceholder: "メンバーを選択",
    noCandidates: "譲渡先にできる他のメンバーがいません。",
    submit: "譲渡を申請する",
    unknownMember: "不明なメンバー",
    requester: {
      status: "{{name}} さんに所有権の譲渡を申請中です。",
      next: "相手が所有できる状態になるまで、あなたがオーナーのままです。",
      cancel: "申請を取り消す",
    },
    recipient: {
      status: "{{name}} さんから所有権の譲渡を申請されています。",
      next: "所有権を引き継ぐには、必要な手続きを完了してください。切り替わるまで権限は変わりません。引き継がない場合は辞退できます。",
      proceed: "手続きを進める",
      decline: "辞退する",
    },
    completed: {
      requester: "所有権を {{name}} さんに譲渡しました。",
      recipient: "所有権の譲渡が完了しました。あなたがオーナーです。",
    },
    expiresAt: "有効期限: {{date}}",
    errors: {
      generic: "操作できませんでした。時間をおいてもう一度お試しください。",
      alreadyPending: "すでに有効な譲渡の申請があります。",
      invalidRecipient: "このメンバーには譲渡できません。",
      notPending: "申請はすでに終了しています。最新の状態を表示します。",
      projectDeleting: "このプロジェクトは削除手続き中です。",
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
      "An owner can ask an existing member to take over ownership. The request itself does not change permissions.",
    confirmNotice:
      "Ownership switches when the recipient becomes eligible. The request expires in 7 days and can be cancelled before the switch.",
    recipientLabel: "Member to transfer to",
    recipientPlaceholder: "Select a member",
    noCandidates: "There is no other member to transfer to.",
    submit: "Request transfer",
    unknownMember: "Unknown member",
    requester: {
      status: "You asked {{name}} to take over ownership.",
      next: "You remain the owner until the recipient becomes eligible.",
      cancel: "Cancel request",
    },
    recipient: {
      status: "{{name}} asked you to take over ownership.",
      next: "Complete the required steps to take over ownership. Your permissions remain unchanged until the switch. You can decline the request.",
      proceed: "Continue",
      decline: "Decline",
    },
    completed: {
      requester: "Ownership was transferred to {{name}}.",
      recipient: "The ownership transfer is complete. You are the owner.",
    },
    expiresAt: "Expires: {{date}}",
    errors: {
      generic: "The action failed. Please try again in a moment.",
      alreadyPending: "A transfer request is already pending.",
      invalidRecipient: "Ownership cannot be transferred to this member.",
      notPending: "The request has already ended. Showing the latest state.",
      projectDeleting: "This project is being deleted.",
    },
  },
} as const;
