import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { PermissionDenied } from "../components/permission-denied";
import { ProjectStoryBreadcrumb } from "../components/project-story-breadcrumb";
import { StoryAccordionDetail } from "../components/story-accordion-detail";
import { useAuthError } from "../contexts/auth-error-context";
import { useStoryDetail } from "../hooks/use-story-detail";
import { parseStoryNumber, projectStoriesPath } from "../lib/story-routes";
import type { Story } from "../types/story";

export function StoryDetailScreen() {
  const { projectId, storyNumber } = useParams();
  const { notifySessionExpired } = useAuthError();
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [loadedStory, setLoadedStory] = useState<Story | null>(null);
  const retryRequestRef = useRef<null | (() => void)>(null);

  const normalizedStoryNumber = storyNumber
    ? parseStoryNumber(storyNumber)
    : null;
  const missingParams = !projectId || !normalizedStoryNumber;
  const storiesPath = projectId ? projectStoriesPath(projectId) : "/projects";

  const {
    story: fetchedStory,
    isLoading,
    error: detailError,
    errorStatus,
  } = useStoryDetail(projectId ?? "", normalizedStoryNumber ?? "", {
    enabled: !missingParams,
  });

  useEffect(() => {
    if (missingParams) {
      setLoadedStory(null);
      setForbidden(null);
      setIsNotFound(true);
      setRequestError("ストーリーが見つかりません");
      return;
    }

    if (isLoading) {
      return;
    }

    if (fetchedStory) {
      setLoadedStory(fetchedStory);
      setForbidden(null);
      setIsNotFound(false);
      setRequestError(null);
      return;
    }

    setLoadedStory(null);
    if (errorStatus === 401) {
      notifySessionExpired();
      return;
    }
    if (errorStatus === 403) {
      setIsNotFound(false);
      setForbidden(detailError ?? "このストーリーを閲覧する権限がありません。");
      return;
    }
    if (errorStatus === 404) {
      setIsNotFound(true);
      setRequestError(detailError ?? "ストーリーが見つかりません");
      return;
    }

    setIsNotFound(false);
    setRequestError(
      detailError ?? "ストーリーの読み込みに失敗しました。再試行してください。",
    );
  }, [
    detailError,
    errorStatus,
    fetchedStory,
    isLoading,
    missingParams,
    notifySessionExpired,
  ]);

  useEffect(() => {
    retryRequestRef.current = () => {
      setForbidden(null);
      setRequestError(null);
    };
  }, []);

  if (forbidden) {
    return (
      <PermissionDenied
        message={forbidden}
        nextAction="このストーリーの閲覧権限を申請するか、管理者へ確認してください。"
        retryHint="同じストーリーで再試行できます。"
        onRetry={() => retryRequestRef.current?.()}
        backTo={storiesPath}
        backLabel="ストーリー一覧へ戻る"
      />
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm">
        <ProjectStoryBreadcrumb
          projectId={projectId}
          currentPageLabel="ストーリー"
        />
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">ストーリー詳細</h1>
          <Link className="text-sm font-medium text-blue-700" to={storiesPath}>
            ストーリー一覧へ戻る
          </Link>
        </div>

        {isLoading ? (
          <p className="mt-6 text-gray-600">ストーリーを読み込み中です...</p>
        ) : null}

        {!isLoading && requestError && !loadedStory ? (
          <div className="mt-6 space-y-1 text-sm text-red-600" role="status">
            {isNotFound ? <p>404 Not Found</p> : null}
            <p>{requestError}</p>
          </div>
        ) : null}

        {!isLoading && loadedStory ? (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white">
            <StoryAccordionDetail story={loadedStory} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
