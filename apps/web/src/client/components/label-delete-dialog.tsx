import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { LabelDeletionImpact } from "../types/epic";

type LabelDeleteDialogProps = {
  labelName: string;
  impact: LabelDeletionImpact | null;
  error: string | null;
  isBusy: boolean;
  onTurnOff: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LabelDeleteDialog({
  labelName,
  impact,
  error,
  isBusy,
  onTurnOff,
  onCancel,
  onConfirm,
}: LabelDeleteDialogProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);

  const isReady = !isBusy || impact !== null;
  useEffect(() => {
    if (isReady) cancelRef.current?.focus();
  }, [isReady]);

  const epic = impact?.epic ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isBusy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-label-title"
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl sm:p-6"
      >
        <h2
          id="delete-label-title"
          className="text-lg font-semibold text-gray-900"
        >
          {t("projectLabelsScreen.delete.title", { name: labelName })}
        </h2>
        {impact ? (
          <div className="mt-3 text-sm leading-relaxed text-gray-700">
            <p>{t("projectLabelsScreen.delete.impactIntro")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                {t("projectLabelsScreen.delete.stories", {
                  count: impact.storyCount,
                })}
              </li>
              {epic ? (
                <li>
                  {epic.hasPlan
                    ? t("projectLabelsScreen.delete.epicWithPlan")
                    : t("projectLabelsScreen.delete.epicNoPlan")}
                </li>
              ) : null}
            </ul>
            {epic?.hasPlan ? (
              <p className="mt-3 text-gray-600">
                {t("projectLabelsScreen.delete.suggestOff")}
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
            onClick={onCancel}
            disabled={isBusy}
          >
            {t("projectLabelsScreen.delete.cancel")}
          </button>
          {epic?.enabled ? (
            <button
              type="button"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
              onClick={onTurnOff}
              disabled={isBusy}
            >
              {t("projectLabelsScreen.delete.turnOff")}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
            onClick={onConfirm}
            disabled={isBusy || !impact}
          >
            {isBusy
              ? t("projectLabelsScreen.delete.deleting")
              : t("projectLabelsScreen.delete.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
