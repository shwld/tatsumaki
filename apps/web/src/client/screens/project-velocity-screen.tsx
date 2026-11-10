import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import {
  IterationProgressChart,
  type IterationProgressChartPayload,
} from "../components/iteration-progress-chart";
import { ProjectPage } from "../components/project-page";
import { ProjectSection } from "../components/project-section";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";
import { findCurrentIteration } from "../lib/current-iteration";
import { todayIso } from "../../shared/date/today-iso";
import {
  projectIterationsApiPath,
  projectIterationBurndownApiPath,
  projectStoriesApiPath,
  projectStoriesPath,
} from "../lib/story-routes";
import type { Iteration, IterationsResponse } from "../types/iteration";
import type { StoriesResponse } from "../types/story";

type SprintProgressSummary = {
  completedPoints: number;
  incompleteStoryCount: number;
  completionRate: number;
};

function formatIterationRange(iteration: Iteration, t: TFunction): string {
  return t("projectVelocityScreen.iterationRange", {
    start: iteration.startDate,
    end: iteration.endDate,
  });
}

export function ProjectVelocityScreen() {
  const { projectId } = useParams();
  const { t } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [velocity, setVelocity] = useState(0);
  const [currentIterationSummary, setCurrentIterationSummary] =
    useState<SprintProgressSummary | null>(null);
  const [burndownPayload, setBurndownPayload] =
    useState<IterationProgressChartPayload | null>(null);
  const [currentIteration, setCurrentIteration] = useState<Iteration | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const loadVelocity = async () => {
      if (!projectId) {
        setError(t("projectVelocityScreen.projectNotFound"));
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setBurndownPayload(null);
      setCurrentIteration(null);

      try {
        const response = await fetch(projectIterationsApiPath(projectId));
        if (!response.ok) {
          if (!ignore && isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          if (!ignore) {
            setError(t("projectVelocityScreen.loadError"));
          }
          return;
        }

        const data = (await response.json()) as IterationsResponse;
        const nextIterations = Array.isArray(data.iterations)
          ? data.iterations
          : [];
        const currentIteration = findCurrentIteration(nextIterations);
        let nextCurrentIterationSummary: SprintProgressSummary | null = null;

        let nextBurndown: IterationProgressChartPayload | null = null;

        if (currentIteration) {
          const query = new URLSearchParams({
            iterationId: currentIteration.id,
            isIcebox: "false",
          });
          const [summaryResponse, burndownResponse] = await Promise.all([
            fetch(`${projectStoriesApiPath(projectId)}?${query.toString()}`),
            fetch(
              projectIterationBurndownApiPath(projectId, currentIteration.id),
            ),
          ]);
          if (summaryResponse.ok) {
            const summaryData =
              (await summaryResponse.json()) as StoriesResponse;
            const stories = Array.isArray(summaryData.stories)
              ? summaryData.stories
              : [];
            const totalStories = stories.length;
            const acceptedStories = stories.filter(
              (story) => story.status === "Accepted",
            );
            const completedPoints = acceptedStories.reduce(
              (sum, story) => sum + (story.storyPoint ?? 0),
              0,
            );
            const incompleteStoryCount = stories.filter(
              (story) => story.status !== "Accepted",
            ).length;
            const completionRate =
              totalStories === 0
                ? 0
                : Math.round((acceptedStories.length / totalStories) * 100);
            nextCurrentIterationSummary = {
              completedPoints,
              incompleteStoryCount,
              completionRate,
            };
          } else if (!ignore && isAuthError(summaryResponse.status)) {
            notifySessionExpired();
            return;
          }

          if (burndownResponse.ok) {
            nextBurndown =
              (await burndownResponse.json()) as IterationProgressChartPayload;
          } else if (!ignore && isAuthError(burndownResponse.status)) {
            notifySessionExpired();
            return;
          }
        }

        if (!ignore) {
          setIterations(nextIterations);
          setVelocity(typeof data.velocity === "number" ? data.velocity : 0);
          setCurrentIterationSummary(nextCurrentIterationSummary);
          setCurrentIteration(currentIteration);
          setBurndownPayload(nextBurndown);
        }
      } catch {
        if (!ignore) {
          setError(t("projectVelocityScreen.loadError"));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    void loadVelocity();

    return () => {
      ignore = true;
    };
  }, [notifySessionExpired, projectId, t]);

  const completedIterations = useMemo(() => {
    const today = todayIso();
    return iterations
      .filter((iteration) => iteration.endDate < today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [iterations]);

  const totalCompletedPoints = useMemo(() => {
    return completedIterations.reduce(
      (sum, iteration) => sum + iteration.totalPoints,
      0,
    );
  }, [completedIterations]);

  const maxPoints = useMemo(() => {
    return Math.max(
      1,
      ...completedIterations.map((iteration) => iteration.totalPoints),
    );
  }, [completedIterations]);

  return (
    <ProjectPage
      title={t("projectVelocityScreen.title")}
      actions={
        projectId ? (
          <Link
            className="text-sm font-medium text-blue-700"
            to={projectStoriesPath(projectId)}
          >
            {t("projectVelocityScreen.backToStories")}
          </Link>
        ) : null
      }
    >
      <div>
        <p className="text-sm text-gray-600">
          {t("projectVelocityScreen.description")}
        </p>

        {error ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="mt-6 text-sm text-gray-500">
            {t("projectVelocityScreen.loading")}
          </p>
        ) : null}

        {!isLoading && !error ? (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("projectVelocityScreen.stats.recentAverage")}
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {velocity}
                  <span className="ml-1 text-base font-medium text-gray-500">
                    pt
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("projectVelocityScreen.stats.completedSprints")}
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {completedIterations.length}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("projectVelocityScreen.stats.totalCompletedPoints")}
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {totalCompletedPoints}
                  <span className="ml-1 text-base font-medium text-gray-500">
                    pt
                  </span>
                </p>
              </div>
            </section>

            {currentIterationSummary ? (
              <section
                className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-3"
                aria-label={t("projectVelocityScreen.summary.title")}
              >
                <p className="text-sm font-semibold text-gray-900">
                  {t("projectVelocityScreen.summary.title")}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-700 sm:grid-cols-3">
                  <div className="rounded border border-gray-200 bg-white px-2 py-1.5">
                    {t("projectVelocityScreen.summary.completedPoints")}:{" "}
                    <span className="font-semibold text-gray-900">
                      {currentIterationSummary.completedPoints} pt
                    </span>
                  </div>
                  <div className="rounded border border-gray-200 bg-white px-2 py-1.5">
                    {t("projectVelocityScreen.summary.incompleteCount")}:{" "}
                    <span className="font-semibold text-gray-900">
                      {t("projectVelocityScreen.summary.countUnit", {
                        count: currentIterationSummary.incompleteStoryCount,
                      })}
                    </span>
                  </div>
                  <div className="rounded border border-gray-200 bg-white px-2 py-1.5">
                    {t("projectVelocityScreen.summary.completionRate")}:{" "}
                    <span className="font-semibold text-gray-900">
                      {currentIterationSummary.completionRate}%
                    </span>
                  </div>
                </div>
              </section>
            ) : null}

            {burndownPayload && currentIteration ? (
              <div className="mt-6">
                <ProjectSection
                  title={t("projectVelocityScreen.progressChartTitle")}
                  width="full"
                >
                  <IterationProgressChart
                    iterationLabel={formatIterationRange(currentIteration, t)}
                    payload={burndownPayload}
                  />
                </ProjectSection>
              </div>
            ) : null}

            <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <ProjectSection
                title={t("projectVelocityScreen.history.title")}
                width="full"
              >
                {completedIterations.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">
                    {t("projectVelocityScreen.history.empty")}
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="px-2 py-2 font-medium">
                            {t("projectVelocityScreen.history.period")}
                          </th>
                          <th className="px-2 py-2 font-medium">
                            {t("projectVelocityScreen.history.completedPoints")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {completedIterations
                          .slice()
                          .reverse()
                          .map((iteration) => (
                            <tr key={iteration.id}>
                              <td className="px-2 py-2 text-gray-700">
                                {formatIterationRange(iteration, t)}
                              </td>
                              <td className="px-2 py-2 font-medium text-gray-900">
                                {iteration.totalPoints} pt
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ProjectSection>

              <ProjectSection
                title={t("projectVelocityScreen.trend.title")}
                width="full"
              >
                {completedIterations.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">
                    {t("projectVelocityScreen.trend.empty")}
                  </p>
                ) : (
                  <div
                    aria-label={t("projectVelocityScreen.trend.chartLabel")}
                    className="mt-4 space-y-3"
                  >
                    {completedIterations.map((iteration) => (
                      <div key={iteration.id}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-600">
                          <span>{formatIterationRange(iteration, t)}</span>
                          <span>{iteration.totalPoints} pt</span>
                        </div>
                        <div className="h-3 rounded-full bg-gray-100">
                          <div
                            className="h-3 rounded-full bg-blue-600"
                            style={{
                              width: `${Math.max(
                                (iteration.totalPoints / maxPoints) * 100,
                                iteration.totalPoints > 0 ? 8 : 0,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ProjectSection>
            </section>
          </>
        ) : null}
      </div>
    </ProjectPage>
  );
}
