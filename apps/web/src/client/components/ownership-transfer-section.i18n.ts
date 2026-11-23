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
      next: "引き継ぐには、このプロジェクトを月額 3,850 円(税込)で購読してください。購読が完了するまで、あなたの権限は変わりません。引き継がない場合は辞退できます。",
      subscribe: "購読して引き継ぐ",
      paid: "購読を確認しました。所有権の切り替えを待っています。",
      decline: "辞退する",
    },
    processing: {
      requester:
        "所有権を {{name}} さんに移しました。あなたの購読の解約と、未使用の期間の日割り返金を処理しています。",
      recipient:
        "あなたがオーナーになりました。{{name}} さんの購読の解約と返金を処理しています。",
    },
    completed: {
      requester:
        "所有権を {{name}} さんに譲渡しました。あなたの購読を解約し、未使用の期間は日割りで元のお支払い方法に返金しました(購読が 0 円の場合は返金はありません)。",
      recipient:
        "所有権の譲渡が完了しました。あなたがオーナーで、このプロジェクトはあなたの購読で利用できます。",
    },
    review: {
      requester:
        "所有権は {{name}} さんに移りましたが、返金を自動では処理できませんでした。運営が確認しています。",
      recipient:
        "所有権の譲渡は完了しましたが、{{name}} さんの購読の返金を自動では処理できませんでした。運営が確認しています。",
    },
    refundReview: {
      recipient:
        "所有権の譲渡は成立しませんでしたが、お支払いの返金を自動では処理できませんでした。運営が確認しています。",
    },
    expiresAt: "有効期限: {{date}}",
    errors: {
      generic: "操作できませんでした。時間をおいてもう一度お試しください。",
      noSubscription:
        "このプロジェクトの購読の支払者ではないか、購読が有効ではないため、申請できません。",
      alreadyPending: "すでに有効な譲渡の申請があります。",
      invalidRecipient: "このメンバーには譲渡できません。",
      notPending: "申請はすでに終了しています。最新の状態を表示します。",
      checkoutDisabled: "現在、新しい購読の受け付けを停止しています。",
      alreadySubscribed: "すでにこのプロジェクトを購読しています。",
      paymentConfirmed:
        "相手の購読がすでに確認されたため、取消・辞退できません。所有権の切り替えをお待ちください。",
      projectDeleting: "このプロジェクトは削除手続き中のため、購読できません。",
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
      next: "To take over, subscribe to this project for ¥3,850 per month (tax included). Your permissions stay the same until the subscription is complete. You can decline if you do not want to.",
      subscribe: "Subscribe and take over",
      paid: "Your subscription is confirmed. Waiting for the ownership switch.",
      decline: "Decline",
    },
    processing: {
      requester:
        "Ownership moved to {{name}}. We are canceling your subscription and refunding the unused period, prorated.",
      recipient:
        "You are now the owner. We are canceling {{name}}'s subscription and refunding it.",
    },
    completed: {
      requester:
        "Ownership was transferred to {{name}}. Your subscription was canceled and the unused period was refunded to your original payment method, prorated (no refund if your subscription was free).",
      recipient:
        "The ownership transfer is complete. You are the owner and this project runs on your subscription.",
    },
    review: {
      requester:
        "Ownership moved to {{name}}, but we could not process your refund automatically. Our team is looking into it.",
      recipient:
        "The ownership transfer is complete, but we could not process {{name}}'s refund automatically. Our team is looking into it.",
    },
    refundReview: {
      recipient:
        "The ownership transfer did not go through, but we could not refund your payment automatically. Our team is looking into it.",
    },
    expiresAt: "Expires: {{date}}",
    errors: {
      generic: "The action failed. Please try again in a moment.",
      noSubscription:
        "You do not pay for this project's subscription, or it is not active, so you cannot request a transfer.",
      alreadyPending: "A transfer request is already pending.",
      invalidRecipient: "Ownership cannot be transferred to this member.",
      notPending: "The request has already ended. Showing the latest state.",
      checkoutDisabled: "New subscriptions are currently paused.",
      alreadySubscribed: "You already subscribe to this project.",
      paymentConfirmed:
        "The subscription has already been confirmed, so the request can no longer be cancelled or declined. Please wait for the ownership switch.",
      projectDeleting:
        "This project is being deleted, so it cannot be subscribed.",
    },
  },
} as const;
