import { useState } from "react";
import { useTranslation } from "react-i18next";

type ReleaseMarkerCreateDialogProps = {
  onSubmit: (values: { name: string; releaseDate: string | null }) => void;
  onClose: () => void;
  submitting?: boolean;
};

export function ReleaseMarkerCreateDialog({
  onSubmit,
  onClose,
  submitting = false,
}: ReleaseMarkerCreateDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [releaseDate, setReleaseDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), releaseDate: releaseDate.trim() || null });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t("releaseMarkerCreateDialog.title")}
    >
      <div className="w-96 rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {t("releaseMarkerCreateDialog.title")}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="release-marker-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t("releaseMarkerCreateDialog.name")}{" "}
              <span className="text-red-500">
                {t("releaseMarkerCreateDialog.required")}
              </span>
            </label>
            <input
              id="release-marker-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              placeholder={t("releaseMarkerCreateDialog.placeholder")}
              required
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="release-marker-date"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t("releaseMarkerCreateDialog.releaseDate")}
            </label>
            <input
              id="release-marker-date"
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("releaseMarkerCreateDialog.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting
                ? t("releaseMarkerCreateDialog.creating")
                : t("releaseMarkerCreateDialog.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
