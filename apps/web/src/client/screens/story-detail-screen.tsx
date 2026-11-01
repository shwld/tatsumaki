import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";

import { PermissionDenied } from "../components/permission-denied";
import { ProjectPage } from "../components/project-page";
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
    <ProjectPage title="ストーリー詳細">
      {isLoading ? (
        <p className="text-gray-600">ストーリーを読み込み中です...</p>
      ) : null}

      {!isLoading && requestError && !loadedStory ? (
        <div className="space-y-1 text-sm text-red-600" role="status">
          {isNotFound ? <p>404 Not Found</p> : null}
          <p>{requestError}</p>
        </div>
      ) : null}

      {!isLoading && loadedStory ? (
        <div className="max-w-2xl rounded-lg border border-gray-200 bg-white">
          <StoryAccordionDetail story={loadedStory} />
        </div>
      ) : null}
    </ProjectPage>
  );
}
