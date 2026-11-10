export const projectSettingsScreenJa = {
  projectSettingsScreen: {
    title: "プロジェクト設定",
    loading: "読み込み中...",
    loadError: "プロジェクトの読み込みに失敗しました",
    saveFailed: "保存に失敗しました",
    save: "保存",
    saving: "保存中...",
    ownerRequired: "設定を変更するにはオーナー権限が必要です。",
    toast: {
      nameRequired: "プロジェクト名は必須です",
      updateFailed: "設定の更新に失敗しました",
      projectUpdated: "プロジェクト設定を更新しました",
      pointScaleUpdated: "ポイントスケールを更新しました",
      settingsUpdated: "設定を更新しました",
      noChanges: "変更はありません",
      iterationUpdated: "イテレーション設定を更新しました",
      deleteNameMismatch: "確認用のプロジェクト名が一致しません",
      deleteForbidden:
        "プロジェクトを削除する権限がありません。オーナーに依頼してください。",
      deleteNotFound:
        "対象プロジェクトが見つかりません。既に削除されている可能性があります。",
      deleteFailed: "プロジェクトの削除に失敗しました",
      deleted: "プロジェクトを削除しました",
    },
    general: {
      title: "基本設定",
      name: "プロジェクト名",
      description: "説明",
      isPublic: "プロジェクトを公開する",
      timezone: "タイムゾーン",
    },
    pointScale: {
      title: "ポイントスケール",
      customValues: "カスタム値（カンマ区切り）",
      customInvalid:
        "カスタムスケールは0以上の整数をカンマ区切りで入力してください",
      types: {
        fibonacci: "フィボナッチ (0, 1, 2, 3, 5, 8, 13)",
        linear: "リニア (0, 1, 2, 3, 4, 5)",
        powers_of_2: "2のべき乗 (0, 1, 2, 4, 8, 16)",
        custom: "カスタム",
      },
    },
    estimate: {
      title: "見積もり設定",
      description:
        "Bug・Choreタイプのストーリーにポイント見積もりを付けるかどうかを設定します。",
      bugs: "Bugの見積もりを有効にする",
      chores: "Choreの見積もりを有効にする",
    },
    iteration: {
      title: "イテレーション設定",
      description:
        "スプリントの長さと開始曜日を設定します。保存後に再計算が完了すると反映されます。",
      length: "イテレーション長",
      startDay: "開始曜日",
      recalculating: "再計算中...",
      durations: {
        "7": "1週間",
        "14": "2週間",
        "21": "3週間",
        "28": "4週間",
      },
      days: {
        "0": "日曜日",
        "1": "月曜日",
        "2": "火曜日",
        "3": "水曜日",
        "4": "木曜日",
        "5": "金曜日",
        "6": "土曜日",
      },
    },
    labels: {
      title: "Label と戦略・計画管理",
      description:
        "Label ごとに戦略・計画管理を ON/OFF し、目的・成功条件・期間を記録します。",
      open: "Label 設定を開く",
    },
    apiKeys: {
      title: "APIキー管理",
      description: "CLI や外部ツール向けの API キーを発行・失効します。",
      open: "APIキー管理を開く",
    },
    danger: {
      title: "危険操作: プロジェクト削除",
      description:
        "この操作は取り消せません。削除するにはプロジェクト名を正確に入力してください。",
      confirmName: "確認用プロジェクト名",
      delete: "プロジェクトを削除する",
      deleting: "削除中...",
    },
  },
} as const;

export const projectSettingsScreenEn = {
  projectSettingsScreen: {
    title: "Project settings",
    loading: "Loading...",
    loadError: "Failed to load the project",
    saveFailed: "Failed to save",
    save: "Save",
    saving: "Saving...",
    ownerRequired: "Owner permission is required to change these settings.",
    toast: {
      nameRequired: "Project name is required",
      updateFailed: "Failed to update settings",
      projectUpdated: "Project settings updated",
      pointScaleUpdated: "Point scale updated",
      settingsUpdated: "Settings updated",
      noChanges: "No changes",
      iterationUpdated: "Iteration settings updated",
      deleteNameMismatch: "The confirmation project name does not match",
      deleteForbidden:
        "You do not have permission to delete this project. Ask an owner.",
      deleteNotFound:
        "The project was not found. It may have already been deleted.",
      deleteFailed: "Failed to delete the project",
      deleted: "Project deleted",
    },
    general: {
      title: "General settings",
      name: "Project name",
      description: "Description",
      isPublic: "Make the project public",
      timezone: "Time zone",
    },
    pointScale: {
      title: "Point scale",
      customValues: "Custom values (comma-separated)",
      customInvalid:
        "Enter the custom scale as comma-separated integers of 0 or more",
      types: {
        fibonacci: "Fibonacci (0, 1, 2, 3, 5, 8, 13)",
        linear: "Linear (0, 1, 2, 3, 4, 5)",
        powers_of_2: "Powers of 2 (0, 1, 2, 4, 8, 16)",
        custom: "Custom",
      },
    },
    estimate: {
      title: "Estimation settings",
      description:
        "Choose whether Bug and Chore stories can have point estimates.",
      bugs: "Enable estimates for Bugs",
      chores: "Enable estimates for Chores",
    },
    iteration: {
      title: "Iteration settings",
      description:
        "Set the sprint length and start day. Changes take effect after recalculation finishes.",
      length: "Iteration length",
      startDay: "Start day",
      recalculating: "Recalculating...",
      durations: {
        "7": "1 week",
        "14": "2 weeks",
        "21": "3 weeks",
        "28": "4 weeks",
      },
      days: {
        "0": "Sunday",
        "1": "Monday",
        "2": "Tuesday",
        "3": "Wednesday",
        "4": "Thursday",
        "5": "Friday",
        "6": "Saturday",
      },
    },
    labels: {
      title: "Labels and strategic planning",
      description:
        "Turn strategic planning on or off per Label and record its goal, success criteria, and period.",
      open: "Open Label settings",
    },
    apiKeys: {
      title: "API key management",
      description: "Issue and revoke API keys for the CLI and external tools.",
      open: "Open API key management",
    },
    danger: {
      title: "Danger zone: delete project",
      description:
        "This cannot be undone. Enter the project name exactly to delete it.",
      confirmName: "Confirm project name",
      delete: "Delete project",
      deleting: "Deleting...",
    },
  },
} as const;
