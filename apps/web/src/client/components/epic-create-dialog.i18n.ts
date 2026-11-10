export const epicCreateDialogJa = {
  epicCreateDialog: {
    title: "Epic を作成",
    hint: "Epic は計画管理が ON の Label です。同名の Label があればそれを Epic にし、無ければ新しい Label を作成します。",
    name: "名前",
    required: "*",
    placeholder: "例: オンボーディング改善",
    color: "色",
    colorOption: "色 {{color}}",
    cancel: "キャンセル",
    create: "作成",
    creating: "作成中...",
    errors: {
      nameRequired: "名前を入力してください",
      nameTooLong: "名前は 50 文字以内で入力してください",
      duplicate: "同じ名前の Epic が既にあります",
      forbidden: "Epic を作成する権限がありません",
      failed: "Epic を作成できませんでした。もう一度お試しください",
    },
  },
} as const;

export const epicCreateDialogEn = {
  epicCreateDialog: {
    title: "Create epic",
    hint: "An epic is a label with planning on. A label with the same name becomes the epic; otherwise a new label is created.",
    name: "Name",
    required: "*",
    placeholder: "Example: Improve onboarding",
    color: "Color",
    colorOption: "Color {{color}}",
    cancel: "Cancel",
    create: "Create",
    creating: "Creating...",
    errors: {
      nameRequired: "Enter a name",
      nameTooLong: "Use 50 characters or fewer",
      duplicate: "An epic with this name already exists",
      forbidden: "You do not have permission to create epics",
      failed: "Could not create the epic. Try again",
    },
  },
} as const;
