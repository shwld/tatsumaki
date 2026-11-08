export const projectLabelsScreenJa = {
  projectLabelsScreen: {
    title: "Labels",
    description:
      "Label ごとに戦略・計画管理を ON にすると、目的・成功条件・担当者・期間を記録できます。進捗は Label を持つ story から集計されます。",
    loading: "Label を読み込み中...",
    loadError: "Label の読み込みに失敗しました",
    retry: "再読み込み",
    empty: "Label がありません。story に Label を付けるとここに表示されます。",
    sessionExpired: "セッションが切れました。再度ログインしてください",
    planning: {
      toggle: "戦略・計画管理",
      on: "ON",
      off: "OFF",
      offHint: "OFF にしても計画は保持され、再度 ON にすると復元されます。",
      toggleError:
        "戦略・計画管理の切り替えに失敗しました。もう一度お試しください",
      notSet: "未設定",
      setupHint: "目的・期間を入力すると、計画の見通しが立てやすくなります。",
    },
    form: {
      description: "目的",
      successCriteria: "成功条件",
      owner: "担当者",
      ownerNone: "未設定",
      plannedStart: "開始日",
      plannedEnd: "終了日",
      outcomeStatus: "成果状態",
      outcome: {
        unevaluated: "未評価",
        achieved: "達成",
        missed: "未達",
      },
      save: "計画を保存",
      saving: "保存中...",
      saved: "保存しました",
      textTooLong: "{{max}} 文字以内で入力してください",
      periodPair: "開始日と終了日は両方入力するか、両方空にしてください",
      periodOrder: "開始日は終了日以前にしてください",
      saveError:
        "保存に失敗しました。入力内容は保持されています。もう一度保存してください",
      conflict:
        "他の人が先にこの計画を更新しました。入力内容は保持されています。最新の版に更新してから、内容を確認して保存し直してください",
      refresh: "最新の版に更新",
      refreshed:
        "最新の版に更新しました。編集していない項目は最新の内容に置き換わっています。内容を確認して保存してください",
      refreshError: "最新の版を取得できませんでした",
      readOnly: "閲覧のみのロールでは計画を編集できません",
    },
    delete: {
      action: "削除",
      actionFor: "{{name}} を削除",
      checking: "確認中...",
      title: "Label「{{name}}」を削除しますか？",
      impactError: "影響の確認に失敗しました。もう一度お試しください",
      impactIntro: "この Label を削除すると次が失われます。",
      stories:
        "{{count}} 件の story からこの Label が外れます（story は削除されません）",
      epicWithPlan: "戦略・計画管理と保存済みの計画が削除されます",
      epicNoPlan: "戦略・計画管理の設定が削除されます",
      suggestOff:
        "計画を残したい場合は、削除せずに戦略・計画管理を OFF にしてください。",
      turnOff: "OFF にして残す",
      cancel: "キャンセル",
      confirm: "削除する",
      deleting: "削除中...",
      error: "削除に失敗しました",
    },
  },
} as const;

export const projectLabelsScreenEn = {
  projectLabelsScreen: {
    title: "Labels",
    description:
      "Turn on strategy planning for a label to record its purpose, success criteria, owner and period. Progress is counted from the stories carrying the label.",
    loading: "Loading labels...",
    loadError: "Failed to load labels",
    retry: "Reload",
    empty: "No labels yet. Labels you add to stories appear here.",
    sessionExpired: "Your session expired. Sign in again",
    planning: {
      toggle: "Strategy planning",
      on: "ON",
      off: "OFF",
      offHint:
        "Turning it off keeps the plan. Turning it on again restores it.",
      toggleError: "Failed to change strategy planning. Try again",
      notSet: "Not set",
      setupHint:
        "Enter a purpose and a period to make the plan easier to follow.",
    },
    form: {
      description: "Purpose",
      successCriteria: "Success criteria",
      owner: "Owner",
      ownerNone: "Not set",
      plannedStart: "Start date",
      plannedEnd: "End date",
      outcomeStatus: "Outcome",
      outcome: {
        unevaluated: "Not evaluated",
        achieved: "Achieved",
        missed: "Missed",
      },
      save: "Save plan",
      saving: "Saving...",
      saved: "Saved",
      textTooLong: "Enter at most {{max}} characters",
      periodPair: "Enter both the start and end dates, or leave both empty",
      periodOrder: "The start date must be on or before the end date",
      saveError: "Failed to save. Your input is kept; save again",
      conflict:
        "Someone else updated this plan first. Your input is kept. Update to the latest version, review it, then save again",
      refresh: "Update to latest version",
      refreshed:
        "Updated to the latest version. Fields you did not edit now show the latest content. Review and save",
      refreshError: "Failed to fetch the latest version",
      readOnly: "Viewers cannot edit plans",
    },
    delete: {
      action: "Delete",
      actionFor: "Delete {{name}}",
      checking: "Checking...",
      title: 'Delete label "{{name}}"?',
      impactError: "Failed to check the impact. Try again",
      impactIntro: "Deleting this label removes the following.",
      stories:
        "The label is removed from {{count}} stories (the stories are not deleted)",
      epicWithPlan: "Strategy planning and the saved plan are deleted",
      epicNoPlan: "The strategy planning setting is deleted",
      suggestOff:
        "To keep the plan, turn strategy planning off instead of deleting the label.",
      turnOff: "Turn off and keep",
      cancel: "Cancel",
      confirm: "Delete",
      deleting: "Deleting...",
      error: "Failed to delete",
    },
  },
} as const;
