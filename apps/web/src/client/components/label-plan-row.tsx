import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  disableEpic,
  enableEpic,
  fetchEpic,
  saveEpicPlan,
} from "../lib/label-planning-api";
import type { Epic, EpicOutcomeStatus, EpicPlanInput } from "../types/epic";
import type { ProjectLabel } from "../types/project-label";

export const EPIC_TEXT_MAX_LENGTH = 1000;
const OUTCOME_STATUSES: EpicOutcomeStatus[] = [
  "unevaluated",
  "achieved",
  "missed",
];

export type MemberOption = { id: string; name: string };

type Draft = {
  description: string;
  successCriteria: string;
  ownerId: string;
  plannedStart: string;
  plannedEnd: string;
  outcomeStatus: EpicOutcomeStatus;
};

function toDraft(epic: Epic | null): Draft {
  return {
    description: epic?.description ?? "",
    successCriteria: epic?.successCriteria ?? "",
    ownerId: epic?.ownerId ?? "",
    plannedStart: epic?.plannedStart ?? "",
    plannedEnd: epic?.plannedEnd ?? "",
    outcomeStatus: epic?.outcomeStatus ?? "unevaluated",
  };
}

function toPlan(draft: Draft): EpicPlanInput {
  return {
    description: draft.description,
    successCriteria: draft.successCriteria,
    ownerId: draft.ownerId === "" ? null : draft.ownerId,
    plannedStart: draft.plannedStart === "" ? null : draft.plannedStart,
    plannedEnd: draft.plannedEnd === "" ? null : draft.plannedEnd,
    outcomeStatus: draft.outcomeStatus,
  };
}

/** Fields the user has not edited follow the latest epic, so unsaved edits survive and nothing newer is overwritten. */
function mergeDraft(current: Draft, before: Epic | null, latest: Epic): Draft {
  const base = toDraft(before);
  const next = toDraft(latest);
  const merged = { ...current };
  for (const key of Object.keys(base) as (keyof Draft)[]) {
    if (current[key] === base[key]) {
      (merged[key] as string) = next[key];
    }
  }
  return merged;
}

type FieldErrorKey = "description" | "successCriteria" | "period";

export function validateDraft(draft: Draft): FieldErrorKey[] {
  const errors: FieldErrorKey[] = [];
  if (draft.description.length > EPIC_TEXT_MAX_LENGTH) {
    errors.push("description");
  }
  if (draft.successCriteria.length > EPIC_TEXT_MAX_LENGTH) {
    errors.push("successCriteria");
  }
  const hasStart = draft.plannedStart !== "";
  const hasEnd = draft.plannedEnd !== "";
  if (hasStart !== hasEnd) {
    errors.push("period");
  } else if (hasStart && draft.plannedStart > draft.plannedEnd) {
    errors.push("period");
  }
  return errors;
}

type Notice =
  | { kind: "none" }
  | { kind: "saved" }
  | { kind: "refreshed" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

type LabelPlanRowProps = {
  projectId: string;
  label: ProjectLabel;
  epic: Epic | null;
  members: MemberOption[];
  canEdit: boolean;
  onEpicChange: (epic: Epic) => void;
  onSessionExpired: () => void;
  onDelete: () => void;
};

export function LabelPlanRow({
  projectId,
  label,
  epic,
  members,
  canEdit,
  onEpicChange,
  onSessionExpired,
  onDelete,
}: LabelPlanRowProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(epic));
  const [notice, setNotice] = useState<Notice>({ kind: "none" });
  const [isBusy, setIsBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const enabled = epic?.enabled === true;
  const errors = validateDraft(draft);
  const field = (key: keyof Draft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const handleToggle = async () => {
    setIsBusy(true);
    setNotice({ kind: "none" });
    const result = enabled
      ? await disableEpic(projectId, label.id, epic?.revision ?? 0)
      : await enableEpic(projectId, label.id, epic ? epic.revision : null);
    setIsBusy(false);
    if (!result.ok) {
      if (result.status === 401) return onSessionExpired();
      setNotice({
        kind: "error",
        message: t("projectLabelsScreen.planning.toggleError"),
      });
      return;
    }
    onEpicChange(result.value);
    setDraft((current) => mergeDraft(current, epic, result.value));
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!epic) return;
    setShowErrors(true);
    if (errors.length > 0) return;
    setIsBusy(true);
    setNotice({ kind: "none" });
    const result = await saveEpicPlan(
      projectId,
      label.id,
      epic.revision,
      toPlan(draft),
    );
    setIsBusy(false);
    if (!result.ok) {
      if (result.status === 401) return onSessionExpired();
      setNotice(
        result.code === "REVISION_CONFLICT"
          ? { kind: "conflict" }
          : {
              kind: "error",
              message: t("projectLabelsScreen.form.saveError"),
            },
      );
      return;
    }
    onEpicChange(result.value);
    setDraft(toDraft(result.value));
    setShowErrors(false);
    setNotice({ kind: "saved" });
  };

  const handleRefresh = async () => {
    setIsBusy(true);
    const result = await fetchEpic(projectId, label.id);
    setIsBusy(false);
    if (!result.ok) {
      if (result.status === 401) return onSessionExpired();
      setNotice({
        kind: "error",
        message: t("projectLabelsScreen.form.refreshError"),
      });
      return;
    }
    setDraft((current) => mergeDraft(current, epic, result.value));
    onEpicChange(result.value);
    setNotice({ kind: "refreshed" });
  };

  const errorText = (key: FieldErrorKey) => {
    if (!showErrors || !errors.includes(key)) return null;
    if (key === "period") {
      return draft.plannedStart !== "" && draft.plannedEnd !== ""
        ? t("projectLabelsScreen.form.periodOrder")
        : t("projectLabelsScreen.form.periodPair");
    }
    return t("projectLabelsScreen.form.textTooLong", {
      max: EPIC_TEXT_MAX_LENGTH,
    });
  };

  const inputClass =
    "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50";
  const periodError = errorText("period");
  const notSet = (
    <span className="text-gray-500">
      {t("projectLabelsScreen.planning.notSet")}
    </span>
  );
  const ownerName =
    members.find((member) => member.id === epic?.ownerId)?.name ??
    epic?.ownerId ??
    null;

  return (
    <li
      className="rounded-md border border-gray-200 bg-white p-4"
      data-testid={`label-row-${label.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border border-gray-300"
            style={{ backgroundColor: label.color }}
          />
          <span className="truncate text-sm font-medium text-gray-900">
            {label.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {canEdit ? (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${t("projectLabelsScreen.planning.toggle")}: ${label.name}`}
              disabled={isBusy}
              onClick={() => void handleToggle()}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 ${enabled ? "bg-blue-600" : "bg-gray-300"}`}
            >
              <span
                aria-hidden
                className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          ) : null}
          <span className="text-xs text-gray-600">
            {t("projectLabelsScreen.planning.toggle")}:{" "}
            {enabled
              ? t("projectLabelsScreen.planning.on")
              : t("projectLabelsScreen.planning.off")}
          </span>
          {canEdit ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={t("projectLabelsScreen.delete.actionFor", {
                name: label.name,
              })}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-gray-50"
            >
              {t("projectLabelsScreen.delete.action")}
            </button>
          ) : null}
        </div>
      </div>

      {!enabled && epic && canEdit ? (
        <p className="mt-2 text-xs text-gray-600">
          {t("projectLabelsScreen.planning.offHint")}
        </p>
      ) : null}

      {enabled && epic && canEdit ? (
        <form className="mt-4 space-y-3" onSubmit={handleSave} noValidate>
          {epic.description === "" && epic.plannedStart === null ? (
            <p className="text-xs text-gray-600">
              {t("projectLabelsScreen.planning.setupHint")}
            </p>
          ) : null}
          <div>
            <label
              className="text-sm font-medium text-gray-700"
              htmlFor={`${baseId}-description`}
            >
              {t("projectLabelsScreen.form.description")}
            </label>
            <textarea
              id={`${baseId}-description`}
              rows={2}
              className={inputClass}
              value={draft.description}
              onChange={(e) => field("description")(e.target.value)}
              aria-invalid={Boolean(errorText("description"))}
            />
            {errorText("description") ? (
              <p role="alert" className="mt-1 text-xs text-red-700">
                {errorText("description")}
              </p>
            ) : null}
          </div>
          <div>
            <label
              className="text-sm font-medium text-gray-700"
              htmlFor={`${baseId}-criteria`}
            >
              {t("projectLabelsScreen.form.successCriteria")}
            </label>
            <textarea
              id={`${baseId}-criteria`}
              rows={2}
              className={inputClass}
              value={draft.successCriteria}
              onChange={(e) => field("successCriteria")(e.target.value)}
              aria-invalid={Boolean(errorText("successCriteria"))}
            />
            {errorText("successCriteria") ? (
              <p role="alert" className="mt-1 text-xs text-red-700">
                {errorText("successCriteria")}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                className="text-sm font-medium text-gray-700"
                htmlFor={`${baseId}-owner`}
              >
                {t("projectLabelsScreen.form.owner")}
              </label>
              <select
                id={`${baseId}-owner`}
                className={inputClass}
                value={draft.ownerId}
                onChange={(e) => field("ownerId")(e.target.value)}
              >
                <option value="">
                  {t("projectLabelsScreen.form.ownerNone")}
                </option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-sm font-medium text-gray-700"
                htmlFor={`${baseId}-start`}
              >
                {t("projectLabelsScreen.form.plannedStart")}
              </label>
              <input
                id={`${baseId}-start`}
                type="date"
                className={inputClass}
                value={draft.plannedStart}
                onChange={(e) => field("plannedStart")(e.target.value)}
                aria-invalid={Boolean(periodError)}
              />
            </div>
            <div>
              <label
                className="text-sm font-medium text-gray-700"
                htmlFor={`${baseId}-end`}
              >
                {t("projectLabelsScreen.form.plannedEnd")}
              </label>
              <input
                id={`${baseId}-end`}
                type="date"
                className={inputClass}
                value={draft.plannedEnd}
                onChange={(e) => field("plannedEnd")(e.target.value)}
                aria-invalid={Boolean(periodError)}
              />
            </div>
            <div>
              <label
                className="text-sm font-medium text-gray-700"
                htmlFor={`${baseId}-outcome`}
              >
                {t("projectLabelsScreen.form.outcomeStatus")}
              </label>
              <select
                id={`${baseId}-outcome`}
                className={inputClass}
                value={draft.outcomeStatus}
                onChange={(e) => field("outcomeStatus")(e.target.value)}
              >
                {OUTCOME_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`projectLabelsScreen.form.outcome.${status}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {periodError ? (
            <p role="alert" className="text-xs text-red-700">
              {periodError}
            </p>
          ) : null}

          {notice.kind === "conflict" ? (
            <div
              role="alert"
              className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p>{t("projectLabelsScreen.form.conflict")}</p>
              <button
                type="button"
                className="mt-2 rounded-md border border-amber-300 px-3 py-1 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
                onClick={() => void handleRefresh()}
                disabled={isBusy}
              >
                {t("projectLabelsScreen.form.refresh")}
              </button>
            </div>
          ) : null}
          {notice.kind === "error" ? (
            <p role="alert" className="text-sm text-red-700">
              {notice.message}
            </p>
          ) : null}
          {notice.kind === "saved" || notice.kind === "refreshed" ? (
            <p role="status" className="text-sm text-green-700">
              {notice.kind === "saved"
                ? t("projectLabelsScreen.form.saved")
                : t("projectLabelsScreen.form.refreshed")}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isBusy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isBusy
              ? t("projectLabelsScreen.form.saving")
              : t("projectLabelsScreen.form.save")}
          </button>
        </form>
      ) : null}

      {enabled && epic && !canEdit ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-600">
              {t("projectLabelsScreen.form.description")}
            </dt>
            <dd className="whitespace-pre-wrap text-gray-900">
              {epic.description || notSet}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-600">
              {t("projectLabelsScreen.form.successCriteria")}
            </dt>
            <dd className="whitespace-pre-wrap text-gray-900">
              {epic.successCriteria || notSet}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-600">
              {t("projectLabelsScreen.form.owner")}
            </dt>
            <dd className="text-gray-900">{ownerName ?? notSet}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-600">
              {t("projectLabelsScreen.form.plannedStart")} /{" "}
              {t("projectLabelsScreen.form.plannedEnd")}
            </dt>
            <dd className="text-gray-900">
              {epic.plannedStart && epic.plannedEnd
                ? `${epic.plannedStart} – ${epic.plannedEnd}`
                : notSet}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-600">
              {t("projectLabelsScreen.form.outcomeStatus")}
            </dt>
            <dd className="text-gray-900">
              {t(`projectLabelsScreen.form.outcome.${epic.outcomeStatus}`)}
            </dd>
          </div>
        </dl>
      ) : null}

      {notice.kind === "error" && !(enabled && canEdit) ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {notice.message}
        </p>
      ) : null}
    </li>
  );
}
