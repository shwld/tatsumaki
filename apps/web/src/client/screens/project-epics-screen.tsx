import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { EpicCreateDialog } from "../components/epic-create-dialog";
import { ProjectPage } from "../components/project-page";
import { useAuthError } from "../contexts/auth-error-context";
import {
  layoutTimeline,
  monthIndexOf,
  monthLabel,
  TIMELINE_MONTHS,
  type MonthIndex,
} from "../lib/epic-timeline";
import {
  fetchEpicProgress,
  fetchEpicsProgress,
} from "../lib/label-planning-api";
import {
  projectEpicPath,
  projectEpicsPath,
  projectLabelsPath,
  projectStoriesByLabelPath,
} from "../lib/story-routes";
import type { EpicWithProgress } from "../types/epic";

const MIN_BAR_WIDTH = "0.5rem";
const INLINE_LABEL_MIN_PERCENT = 18;

const percent = (rate: number | null) => Math.round((rate ?? 0) * 100);

function currentMonth(): MonthIndex {
  return monthIndexOf(new Date().toISOString().slice(0, 10));
}

function sortItems(items: EpicWithProgress[]): EpicWithProgress[] {
  return [...items].sort(
    (a, b) =>
      (a.epic.plannedStart ?? "").localeCompare(b.epic.plannedStart ?? "") ||
      a.epic.labelName.localeCompare(b.epic.labelName),
  );
}

function useEpicsProgress(projectId: string | undefined) {
  const { notifySessionExpired } = useAuthError();
  const [items, setItems] = useState<EpicWithProgress[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let ignore = false;
    setLoadError(false);
    void fetchEpicsProgress(projectId).then((result) => {
      if (ignore) return;
      if (!result.ok) {
        if (result.status === 401) return notifySessionExpired();
        return setLoadError(true);
      }
      setItems(sortItems(result.value.filter((item) => item.epic.enabled)));
    });
    return () => {
      ignore = true;
    };
  }, [projectId, reloadKey, notifySessionExpired]);

  return { items, loadError, reload: () => setReloadKey((key) => key + 1) };
}

function ErrorRetry({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="text-sm text-red-700">
      <p>{message}</p>
      <button
        type="button"
        className="mt-2 rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
        onClick={onRetry}
      >
        {retryLabel}
      </button>
    </div>
  );
}

export function ProjectEpicsScreen() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { items, loadError, reload } = useEpicsProgress(projectId);
  const [creating, setCreating] = useState(false);
  const [windowStart, setWindowStart] = useState<MonthIndex>(
    () => currentMonth() - 1,
  );

  const formatMonth = (index: MonthIndex) => {
    const { year, month } = monthLabel(index);
    return t("projectEpicsScreen.monthShort", { year, month });
  };
  const months = Array.from(
    { length: TIMELINE_MONTHS },
    (_, i) => windowStart + i,
  );
  const layout = layoutTimeline(items ?? [], windowStart);
  const jumpTarget = (list: EpicWithProgress[], pick: "start" | "end") => {
    const epic = list[0]?.epic;
    const date = pick === "start" ? epic?.plannedStart : epic?.plannedEnd;
    return date ? monthIndexOf(date) : null;
  };

  const nearestBefore = [...layout.before].sort((a, b) =>
    (b.epic.plannedEnd ?? "").localeCompare(a.epic.plannedEnd ?? ""),
  );
  const nearestAfter = [...layout.after].sort((a, b) =>
    (a.epic.plannedStart ?? "").localeCompare(b.epic.plannedStart ?? ""),
  );

  return (
    <ProjectPage title={t("projectEpicsScreen.title")}>
      <p className="mb-4 max-w-3xl text-sm text-gray-600">
        {t("projectEpicsScreen.description")}
      </p>
      <button
        type="button"
        className="mb-4 rounded-md border border-blue-600 bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        onClick={() => setCreating(true)}
      >
        {t("projectEpicsScreen.create")}
      </button>
      {creating ? (
        <EpicCreateDialog
          projectId={projectId}
          onClose={() => setCreating(false)}
          onCreated={(epic) => {
            setCreating(false);
            navigate(projectEpicPath(projectId, epic.labelId));
          }}
        />
      ) : null}
      {loadError ? (
        <ErrorRetry
          message={t("projectEpicsScreen.loadError")}
          retryLabel={t("projectEpicsScreen.retry")}
          onRetry={reload}
        />
      ) : !items ? (
        <p role="status" className="text-sm text-gray-600">
          {t("projectEpicsScreen.loading")}
        </p>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-600">
          <p>{t("projectEpicsScreen.empty")}</p>
          <Link
            to={projectLabelsPath(projectId)}
            className="mt-2 inline-block text-blue-700 underline"
          >
            {t("projectEpicsScreen.openLabels")}
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => setWindowStart((value) => value - 1)}
            >
              {t("projectEpicsScreen.prev")}
            </button>
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => setWindowStart((value) => value + 1)}
            >
              {t("projectEpicsScreen.next")}
            </button>
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => setWindowStart(currentMonth() - 1)}
            >
              {t("projectEpicsScreen.today")}
            </button>
            <span className="text-sm text-gray-600">
              {t("projectEpicsScreen.range", {
                from: formatMonth(months[0] ?? windowStart),
                to: formatMonth(months[months.length - 1] ?? windowStart),
              })}
            </span>
          </div>

          <div className="mb-2 space-y-1 text-sm text-gray-700">
            {layout.before.length > 0 ? (
              <p className="flex items-center gap-2">
                {t("projectEpicsScreen.outside.before", {
                  count: layout.before.length,
                })}
                <button
                  type="button"
                  className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50"
                  onClick={() => {
                    const target = jumpTarget(nearestBefore, "end");
                    if (target !== null)
                      setWindowStart(target - (TIMELINE_MONTHS - 1));
                  }}
                >
                  {t("projectEpicsScreen.outside.move")}
                </button>
              </p>
            ) : null}
            {layout.after.length > 0 ? (
              <p className="flex items-center gap-2">
                {t("projectEpicsScreen.outside.after", {
                  count: layout.after.length,
                })}
                <button
                  type="button"
                  className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50"
                  onClick={() => {
                    const target = jumpTarget(nearestAfter, "start");
                    if (target !== null) setWindowStart(target);
                  }}
                >
                  {t("projectEpicsScreen.outside.move")}
                </button>
              </p>
            ) : null}
          </div>

          <section aria-label={t("projectEpicsScreen.timelineLabel")}>
            <div className="grid grid-cols-6 border-b border-gray-300 text-xs text-gray-600">
              {months.map((index) => (
                <div key={index} className="border-l border-gray-200 px-1 py-1">
                  {formatMonth(index)}
                </div>
              ))}
            </div>
            <ul className="space-y-2 py-2">
              {layout.visible.map(({ item, bar }) => (
                <TimelineRow
                  key={item.epic.id}
                  projectId={projectId}
                  item={item}
                  bar={bar}
                />
              ))}
            </ul>
          </section>

          <section className="mt-6">
            <h2 className="mb-1 text-base font-semibold text-gray-900">
              {t("projectEpicsScreen.unscheduled.title")}
            </h2>
            <p className="mb-2 text-sm text-gray-600">
              {t("projectEpicsScreen.unscheduled.hint")}
            </p>
            {layout.unscheduled.length === 0 ? (
              <p className="text-sm text-gray-500">
                {t("projectEpicsScreen.unscheduled.empty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {layout.unscheduled.map((item) => (
                  <li key={item.epic.id}>
                    <EpicLink projectId={projectId} item={item} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </ProjectPage>
  );
}

function EpicBadges({ item }: { item: EpicWithProgress }) {
  const { t } = useTranslation();
  return (
    <>
      {item.progress.overdue ? (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
          {t("projectEpicsScreen.overdue")}
        </span>
      ) : null}
      {item.progress.state === "no_stories" ? (
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
          {t("projectEpicsScreen.noStories")}
        </span>
      ) : null}
    </>
  );
}

function EpicLink({
  projectId,
  item,
}: {
  projectId: string;
  item: EpicWithProgress;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={projectEpicPath(projectId, item.epic.labelId)}
      className="inline-flex flex-wrap items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
    >
      <span
        aria-hidden
        className="size-3 rounded-full"
        style={{ backgroundColor: item.epic.labelColor }}
      />
      <span className="font-medium text-gray-900">{item.epic.labelName}</span>
      <span className="text-gray-600">
        {t("projectEpicsScreen.progress", {
          percent: percent(item.progress.storyCompletionRate),
        })}
      </span>
      <EpicBadges item={item} />
    </Link>
  );
}

function TimelineRow({
  projectId,
  item,
  bar,
}: {
  projectId: string;
  item: EpicWithProgress;
  bar: {
    leftPercent: number;
    widthPercent: number;
    clippedStart: boolean;
    clippedEnd: boolean;
  };
}) {
  const { t } = useTranslation();
  const { epic, progress } = item;
  const inlineLabel = bar.widthPercent >= INLINE_LABEL_MIN_PERCENT;
  const labelContent = (
    <>
      <span className="font-medium">{epic.labelName}</span>
      <span>
        {t("projectEpicsScreen.progress", {
          percent: percent(progress.storyCompletionRate),
        })}
      </span>
      <EpicBadges item={item} />
    </>
  );
  return (
    <li className="relative h-9">
      <Link
        to={projectEpicPath(projectId, epic.labelId)}
        aria-label={t("projectEpicsScreen.barLabel", {
          name: epic.labelName,
          start: epic.plannedStart,
          end: epic.plannedEnd,
          accepted: progress.stories.accepted,
          total: progress.stories.total,
        })}
        title={[
          bar.clippedStart ? t("projectEpicsScreen.clippedStart") : null,
          bar.clippedEnd ? t("projectEpicsScreen.clippedEnd") : null,
        ]
          .filter(Boolean)
          .join(" / ")}
        className={`absolute inset-y-0 flex items-center overflow-hidden border border-gray-400 bg-gray-100 text-xs text-gray-900 hover:border-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
          bar.clippedStart ? "" : "rounded-l-md"
        } ${bar.clippedEnd ? "" : "rounded-r-md"} ${
          progress.overdue ? "border-red-600" : ""
        }`}
        style={{
          left: `${bar.leftPercent}%`,
          width: `${bar.widthPercent}%`,
          minWidth: MIN_BAR_WIDTH,
        }}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 opacity-40"
          style={{
            width: `${percent(progress.storyCompletionRate)}%`,
            backgroundColor: epic.labelColor,
          }}
        />
        {inlineLabel ? (
          <span className="relative flex items-center gap-2 whitespace-nowrap px-2">
            {labelContent}
          </span>
        ) : null}
      </Link>
      {inlineLabel ? null : (
        <Link
          to={projectEpicPath(projectId, epic.labelId)}
          aria-hidden
          tabIndex={-1}
          className="absolute inset-y-0 flex items-center gap-2 whitespace-nowrap px-2 text-xs text-gray-900"
          style={
            bar.leftPercent < 60
              ? { left: `${bar.leftPercent + bar.widthPercent}%` }
              : { right: `${100 - bar.leftPercent}%` }
          }
        >
          {labelContent}
        </Link>
      )}
    </li>
  );
}

export function ProjectEpicDetailScreen() {
  const { t } = useTranslation();
  const { projectId = "", labelId = "" } = useParams<{
    projectId: string;
    labelId: string;
  }>();
  const { notifySessionExpired } = useAuthError();
  const [item, setItem] = useState<EpicWithProgress | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!projectId || !labelId) return;
    let ignore = false;
    setItem(null);
    setOwnerName(null);
    setLoadError(false);
    const run = async () => {
      const result = await fetchEpicProgress(projectId, labelId);
      if (ignore) return;
      if (!result.ok) {
        if (result.status === 401) return notifySessionExpired();
        return setLoadError(true);
      }
      setItem(result.value);
      const ownerId = result.value.epic.ownerId;
      if (!ownerId) return setOwnerName(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/members`);
        const payload = (await response.json()) as {
          members?: Array<{ userId?: string; displayName?: string | null }>;
        };
        if (ignore) return;
        const member = payload.members?.find((m) => m.userId === ownerId);
        setOwnerName(member?.displayName ?? ownerId);
      } catch {
        if (!ignore) setOwnerName(ownerId);
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [projectId, labelId, reloadKey, notifySessionExpired]);

  const text = (value: string) =>
    value.trim() === "" ? t("projectEpicDetailScreen.notSet") : value;

  return (
    <ProjectPage title={item?.epic.labelName ?? t("projectEpicsScreen.title")}>
      <Link
        to={projectEpicsPath(projectId)}
        className="mb-4 inline-block text-sm text-blue-700 underline"
      >
        {t("projectEpicDetailScreen.back")}
      </Link>
      {loadError ? (
        <ErrorRetry
          message={t("projectEpicDetailScreen.loadError")}
          retryLabel={t("projectEpicDetailScreen.retry")}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : !item ? (
        <p role="status" className="text-sm text-gray-600">
          {t("projectEpicDetailScreen.loading")}
        </p>
      ) : (
        <EpicDetail
          item={item}
          ownerName={ownerName}
          text={text}
          projectId={projectId}
        />
      )}
    </ProjectPage>
  );
}

function EpicDetail({
  item,
  ownerName,
  text,
  projectId,
}: {
  item: EpicWithProgress;
  ownerName: string | null;
  text: (value: string) => string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { epic, progress } = item;
  const { stories, points } = progress;
  const rate = percent(progress.storyCompletionRate);
  const rows: Array<[string, number]> = [
    [t("projectEpicDetailScreen.counts.accepted"), stories.accepted],
    [t("projectEpicDetailScreen.counts.inProgress"), stories.inProgress],
    [t("projectEpicDetailScreen.counts.unstarted"), stories.unstarted],
    [t("projectEpicDetailScreen.counts.icebox"), stories.icebox],
    [t("projectEpicDetailScreen.counts.blocked"), stories.blocked],
  ];
  return (
    <div className="max-w-3xl space-y-5 text-sm text-gray-800">
      <section>
        <h2 className="mb-1 font-semibold">
          {t("projectEpicDetailScreen.progress")}
        </h2>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
            {t(`projectEpicDetailScreen.state.${progress.state}`)}
          </span>
          {progress.overdue ? (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
              {t("projectEpicDetailScreen.overdue")}
            </span>
          ) : null}
        </div>
        {stories.total === 0 ? (
          <p>{t("projectEpicDetailScreen.progressNone")}</p>
        ) : (
          <>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={rate}
              className="h-2 w-full overflow-hidden rounded bg-gray-200"
            >
              <div
                className="h-full"
                style={{ width: `${rate}%`, backgroundColor: epic.labelColor }}
              />
            </div>
            <p className="mt-1">
              {t("projectEpicDetailScreen.progressRate", {
                percent: rate,
                accepted: stories.accepted,
                total: stories.total,
              })}
            </p>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-semibold">
          {t("projectEpicDetailScreen.breakdown")}
        </h2>
        <dl className="grid grid-cols-[auto_auto] justify-start gap-x-6 gap-y-0.5">
          {rows.map(([label, count]) => (
            <div key={label} className="contents">
              <dt className="text-gray-600">{label}</dt>
              <dd>{count}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="mb-1 font-semibold">
          {t("projectEpicDetailScreen.points")}
        </h2>
        <p>
          {points.estimatedPoints === 0
            ? t("projectEpicDetailScreen.pointsNone")
            : t("projectEpicDetailScreen.pointsRate", {
                accepted: points.acceptedPoints,
                estimated: points.estimatedPoints,
                percent: percent(progress.pointCompletionRate),
              })}
        </p>
        {points.excludedStories > 0 ? (
          <p className="text-gray-600">
            {t("projectEpicDetailScreen.pointsExcluded", {
              count: points.excludedStories,
            })}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">
            {t("projectEpicDetailScreen.description")}
          </h2>
          <p className="whitespace-pre-wrap">{text(epic.description)}</p>
        </div>
        <div>
          <h2 className="font-semibold">
            {t("projectEpicDetailScreen.successCriteria")}
          </h2>
          <p className="whitespace-pre-wrap">{text(epic.successCriteria)}</p>
        </div>
        <div>
          <h2 className="font-semibold">
            {t("projectEpicDetailScreen.outcome")}
          </h2>
          <p>{t(`projectEpicDetailScreen.outcomes.${epic.outcomeStatus}`)}</p>
        </div>
        <div>
          <h2 className="font-semibold">
            {t("projectEpicDetailScreen.owner")}
          </h2>
          <p>{ownerName ?? t("projectEpicDetailScreen.notSet")}</p>
        </div>
        <div>
          <h2 className="font-semibold">
            {t("projectEpicDetailScreen.period")}
          </h2>
          <p>
            {epic.plannedStart && epic.plannedEnd
              ? `${epic.plannedStart} 〜 ${epic.plannedEnd}`
              : t("projectEpicDetailScreen.periodUnset")}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to={projectStoriesByLabelPath(projectId, epic.labelId)}
          className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          {t("projectEpicDetailScreen.openStories")}
        </Link>
        <Link
          to={projectLabelsPath(projectId)}
          className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          {t("projectEpicDetailScreen.editPlan")}
        </Link>
      </div>
    </div>
  );
}
