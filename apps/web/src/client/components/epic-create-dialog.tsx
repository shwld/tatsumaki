import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuthError } from "../contexts/auth-error-context";
import { enableEpic, fetchEpics } from "../lib/label-planning-api";
import { projectLabelsApiPath } from "../lib/story-routes";
import type { Epic } from "../types/epic";
import type {
  ProjectLabel,
  ProjectLabelResponse,
  ProjectLabelsResponse,
} from "../types/project-label";

const NAME_MAX_LENGTH = 50;
const DEFAULT_COLOR = "#6b7280";
const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#1e293b",
] as const;

type ErrorKey =
  | "nameRequired"
  | "nameTooLong"
  | "duplicate"
  | "forbidden"
  | "failed";

type StepResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorKey | "unauthorized" };

const failure = (status: number): StepResult<never> => ({
  ok: false,
  error:
    status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "failed",
});

async function findLabel(
  projectId: string,
  name: string,
): Promise<StepResult<ProjectLabel | null>> {
  try {
    const response = await fetch(projectLabelsApiPath(projectId));
    if (!response.ok) return failure(response.status);
    const body = (await response.json()) as ProjectLabelsResponse;
    return {
      ok: true,
      value: body.labels.find((label) => label.name === name) ?? null,
    };
  } catch {
    return failure(0);
  }
}

async function createLabel(
  projectId: string,
  name: string,
  color: string,
): Promise<StepResult<ProjectLabel>> {
  try {
    const response = await fetch(projectLabelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    if (!response.ok) return failure(response.status);
    return {
      ok: true,
      value: ((await response.json()) as ProjectLabelResponse).label,
    };
  } catch {
    return failure(0);
  }
}

/**
 * An epic is a label with planning on (ADR-0013). Reusing a same-named label
 * keeps a retry after a partial failure from creating a duplicate.
 */
async function createEpic(
  projectId: string,
  name: string,
  color: string,
): Promise<StepResult<Epic>> {
  const existing = await findLabel(projectId, name);
  if (!existing.ok) return existing;

  let label = existing.value;
  let revision: number | null = null;
  if (label) {
    const epics = await fetchEpics(projectId);
    if (!epics.ok) return failure(epics.status);
    const epic = epics.value.find((item) => item.labelId === label?.id);
    if (epic?.enabled) return { ok: false, error: "duplicate" };
    revision = epic?.revision ?? null;
  } else {
    const created = await createLabel(projectId, name, color);
    if (!created.ok) return created;
    label = created.value;
  }

  const enabled = await enableEpic(projectId, label.id, revision);
  return enabled.ok ? enabled : failure(enabled.status);
}

type EpicCreateDialogProps = {
  projectId: string;
  onCreated: (epic: Epic) => void;
  onClose: () => void;
};

export function EpicCreateDialog({
  projectId,
  onCreated,
  onClose,
}: EpicCreateDialogProps) {
  const { t } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const trimmed = name.trim();
    if (trimmed === "") return setError("nameRequired");
    if (trimmed.length > NAME_MAX_LENGTH) return setError("nameTooLong");

    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const result = await createEpic(projectId, trimmed, color);
    inFlight.current = false;
    setSubmitting(false);
    if (result.ok) return onCreated(result.value);
    if (result.error === "unauthorized") return notifySessionExpired();
    setError(result.error);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t("epicCreateDialog.title")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !submitting) onClose();
      }}
    >
      <div className="w-96 max-w-[90vw] rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-base font-semibold text-gray-900">
          {t("epicCreateDialog.title")}
        </h2>
        <p className="mb-4 text-xs text-gray-600">
          {t("epicCreateDialog.hint")}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="epic-create-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t("epicCreateDialog.name")}{" "}
              <span className="text-red-500">
                {t("epicCreateDialog.required")}
              </span>
            </label>
            <input
              id="epic-create-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={error !== null && error !== "forbidden"}
              aria-describedby={error ? "epic-create-error" : undefined}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              placeholder={t("epicCreateDialog.placeholder")}
              autoFocus
            />
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-gray-700">
              {t("epicCreateDialog.color")}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={t("epicCreateDialog.colorOption", {
                    color: preset,
                  })}
                  aria-pressed={color === preset}
                  className="size-6 rounded-full border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                  style={{
                    backgroundColor: preset,
                    borderColor: color === preset ? "#1d4ed8" : "transparent",
                  }}
                  onClick={() => setColor(preset)}
                />
              ))}
            </div>
          </fieldset>
          {error ? (
            <p
              id="epic-create-error"
              role="alert"
              className="text-sm text-red-700"
            >
              {t(`epicCreateDialog.errors.${error}`)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t("epicCreateDialog.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting
                ? t("epicCreateDialog.creating")
                : t("epicCreateDialog.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
