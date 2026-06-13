import { type RefObject } from "react";
import { AutoGrowSingleLineTextarea } from "./auto-grow-single-line-textarea";

type StoryTitleEditPopoverFieldsProps = {
  titleDraft: string;
  onTitleDraftChange: (value: string) => void;
  originalTitle: string;
  isSaving: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSave: () => void;
  onCancel: () => void;
};

export function StoryTitleEditPopoverFields({
  titleDraft,
  onTitleDraftChange,
  originalTitle,
  isSaving,
  inputRef,
  onSave,
  onCancel,
}: StoryTitleEditPopoverFieldsProps) {
  const trimmed = titleDraft.trim();
  return (
    <>
      <p className="mb-2 text-xs font-medium text-gray-600">タイトルを編集</p>
      <div className="flex gap-2">
        <AutoGrowSingleLineTextarea
          ref={inputRef}
          rows={1}
          className="w-full resize-none rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          value={titleDraft}
          onChange={onTitleDraftChange}
          onEnterKey={() => void onSave()}
          onEscapeKey={onCancel}
        />
        <button
          type="button"
          className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700"
          disabled={!trimmed || trimmed === originalTitle.trim() || isSaving}
          onClick={() => void onSave()}
        >
          保存
        </button>
      </div>
    </>
  );
}
