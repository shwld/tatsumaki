import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

type StoryDeleteConfirmDialogProps = {
  isOpen: boolean;
  storyTitle: string;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function StoryDeleteConfirmDialog({
  isOpen,
  storyTitle,
  isDeleting = false,
  onCancel,
  onConfirm,
}: StoryDeleteConfirmDialogProps) {
  const { t } = useTranslation();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      cancelButtonRef.current?.focus();
    } else if (wasOpenRef.current) {
      previousActiveElementRef.current?.focus();
      previousActiveElementRef.current = null;
    }

    wasOpenRef.current = isOpen;
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isDeleting) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-story-title"
        aria-describedby="delete-story-description"
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl sm:p-6"
      >
        <h2
          id="delete-story-title"
          className="text-lg font-semibold text-gray-900"
        >
          {t("storyDeleteConfirmDialog.title")}
        </h2>
        <p
          id="delete-story-description"
          className="mt-2 text-sm leading-relaxed text-gray-700"
        >
          {t("storyDeleteConfirmDialog.description", { title: storyTitle })}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 sm:w-auto"
            onClick={onCancel}
            disabled={isDeleting}
          >
            {t("storyDeleteConfirmDialog.cancel")}
          </button>
          <button
            type="button"
            className="w-full rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300 sm:w-auto"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting
              ? t("storyDeleteConfirmDialog.deleting")
              : t("storyDeleteConfirmDialog.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
