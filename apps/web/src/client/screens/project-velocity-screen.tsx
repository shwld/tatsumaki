import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import {
  IterationProgressChart,
  type IterationProgressChartPayload,
} from "../components/iteration-progress-chart";
import { ProjectStoryBreadcrumb } from "../components/project-story-breadcrumb";
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

function formatIterationRange(iteration: Iteration): string {
  return `${iteration.startDate} 〜 ${iteration.endDate}`;
}

export function ProjectVelocityScreen() {
  const { projectId } = useParams();
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
        setError("Project not found");
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
            setError("ベロシティの取得に失敗しました");
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
          setError("ベロシティの取得に失敗しました");
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
  }, [notifySessionExpired, projectId]);

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
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-sm">
        <ProjectStoryBreadcrumb
          projectId={projectId}
          currentPageLabel="ベロシティ"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              ベロシティダッシュボード
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              完了済みイテレーションの実績ポイントから、直近3スプリントの平均ベロシティを確認します。
            </p>
          </div>
          {projectId ? (
            <Link
              className="text-sm font-medium text-blue-700"
              to={projectStoriesPath(projectId)}
            >
              ストーリーへ戻る
            </Link>
          ) : null}
        </div>

        {error ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="mt-6 text-sm text-gray-500">読み込み中...</p>
        ) : null}

        {!isLoading && !error ? (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  直近3スプリント平均
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
                  完了スプリント数
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {completedIterations.length}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  累計完了ポイント
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
                aria-label="スプリント進捗サマリー"
              >
                <p className="text-sm font-semibold text-gray-900">
                  スプリント進捗サマリー
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-700 sm:grid-cols-3">
                  <div className="rounded border border-gray-200 bg-white px-2 py-1.5">
                    完了ポイント:{" "}
                    <span className="font-semibold text-gray-900">
                      {currentIterationSummary.completedPoints} pt
                    </span>
                  </div>
                  <div className="rounded border border-gray-200 bg-white px-2 py-1.5">
                    未完了件数:{" "}
                    <span className="font-semibold text-gray-900">
                      {currentIterationSummary.incompleteStoryCount} 件
                    </span>
                  </div>
                  <div className="rounded border border-gray-200 bg-white px-2 py-1.5">
                    達成率:{" "}
                    <span className="font-semibold text-gray-900">
                      {currentIterationSummary.completionRate}%
                    </span>
                  </div>
                </div>
              </section>
            ) : null}

            {burndownPayload && currentIteration ? (
              <section
                className="mt-6 rounded-md border border-gray-200 bg-white p-4 shadow-sm"
                aria-label="現在イテレーションの進捗チャート"
              >
                <h2 className="text-base font-semibold text-gray-900">
                  進捗チャート（現在イテレーション）
                </h2>
                <IterationProgressChart
                  iterationLabel={formatIterationRange(currentIteration)}
                  payload={burndownPayload}
                />
              </section>
            ) : null}

            <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-gray-200 p-4">
                <h2 className="text-base font-semibold text-gray-900">
                  過去スプリント実績
                </h2>
                {completedIterations.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">
                    まだ完了したイテレーションがありません。完了後に実績がここへ表示されます。
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="px-2 py-2 font-medium">期間</th>
                          <th className="px-2 py-2 font-medium">
                            完了ポイント
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
                                {formatIterationRange(iteration)}
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
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h2 className="text-base font-semibold text-gray-900">
                  ベロシティ推移
                </h2>
                {completedIterations.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">
                    推移グラフは、完了したスプリントができると表示されます。
                  </p>
                ) : (
                  <div
                    aria-label="ベロシティ推移チャート"
                    className="mt-4 space-y-3"
                  >
                    {completedIterations.map((iteration) => (
                      <div key={iteration.id}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-600">
                          <span>{formatIterationRange(iteration)}</span>
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
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
