import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { PermissionDenied } from "../components/permission-denied";
import { ProjectStoryBreadcrumb } from "../components/project-story-breadcrumb";
import { StoryAccordionDetail } from "../components/story-accordion-detail";
import { StoryDeleteConfirmDialog } from "../components/story-delete-confirm-dialog";
import { useAuthError } from "../contexts/auth-error-context";
import { useToast } from "../contexts/toast-context";
import { storyQueryKeys } from "../hooks/story-query-keys";
import { useStoryDetail } from "../hooks/use-story-detail";
import { isAuthError, isForbiddenError } from "../lib/api-error";
import { clearDraft, loadDraft, saveDraft } from "../lib/form-draft";
import { buildReturnPath, extractListContext } from "../lib/list-context";
import { parseErrorMessage } from "../lib/parse-error-message";
import { projectStoriesApiPath, projectStoriesPath } from "../lib/story-routes";
import type { Story } from "../types/story";
import { UNKNOWN_MEMBER_DISPLAY_NAME } from "../../lib/member-display-name";
import type { ProjectMemberProfile } from "../types/project";

function draftKey(projectId: string, storyNumber: string): string {
  return `story-edit:${projectId}:${storyNumber}`;
}

export function StoryEditScreen() {
  const { t } = useTranslation();
  const { projectId, storyNumber } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notifySessionExpired } = useAuthError();
  const { showToast } = useToast();
  const [currentSearchParams] = useSearchParams();
  const listContext = extractListContext(currentSearchParams);
  const storiesBasePath = projectId
    ? projectStoriesPath(projectId)
    : "/projects";
  const storiesPath = buildReturnPath(storiesBasePath, listContext);

  const missingParams = !projectId || !storyNumber;
  const overlayKeyRef = useRef<string | null>(null);

  const [loadedStory, setLoadedStory] = useState<Story | null>(null);
  const [isStoryLoaded, setIsStoryLoaded] = useState(false);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pendingDeleteStory, setPendingDeleteStory] = useState<Story | null>(
    null,
  );
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);

  const retryRequestRef = useRef<(() => void) | null>(null);

  const invalidateStoryEditQueries = useCallback(() => {
    if (missingParams || !projectId || !storyNumber) {
      return;
    }
    setForbidden(null);
    setRequestError(null);
    void queryClient.invalidateQueries({
      queryKey: storyQueryKeys.storyDetail(projectId, storyNumber),
    });
    void queryClient.invalidateQueries({
      queryKey: storyQueryKeys.projectMembers(projectId),
    });
  }, [missingParams, projectId, queryClient, storyNumber]);

  const { data: memberOptions = [] } = useQuery({
    queryKey: storyQueryKeys.projectMembers(projectId ?? ""),
    queryFn: async (): Promise<ProjectMemberProfile[]> => {
      const response = await fetch(`/api/projects/${projectId}/members`);
      if (!response.ok) {
        return [];
      }
      const payload = (await response.json()) as {
        members?: Array<{
          userId?: string;
          displayName?: string;
          avatarUrl?: string | null;
          gravatarUrl?: string | null;
        }>;
      };
      if (!Array.isArray(payload.members)) {
        return [];
      }
      return payload.members
        .filter((m): m is typeof m & { userId: string } => Boolean(m.userId))
        .map((m) => ({
          id: m.userId,
          displayName: m.displayName ?? UNKNOWN_MEMBER_DISPLAY_NAME,
          avatarUrl: m.avatarUrl ?? null,
          gravatarUrl: m.gravatarUrl ?? null,
        }));
    },
    enabled: Boolean(projectId),
  });

  const {
    story: fetchedStory,
    isLoading: detailLoading,
    error: detailError,
    errorStatus,
  } = useStoryDetail(projectId ?? "", storyNumber ?? "", {
    enabled: !missingParams,
  });

  const isLoading = missingParams ? false : detailLoading;

  useEffect(() => {
    if (missingParams) {
      overlayKeyRef.current = null;
      setLoadedStory(null);
      setIsStoryLoaded(false);
      return;
    }

    if (!fetchedStory) {
      setLoadedStory(null);
      setIsStoryLoaded(false);
      return;
    }

    const key = `${projectId}:${storyNumber}`;
    let next = fetchedStory;
    if (overlayKeyRef.current !== key) {
      overlayKeyRef.current = key;
      const draft = loadDraft(draftKey(projectId, storyNumber));
      if (draft && typeof draft.title === "string" && draft.title.trim()) {
        next = { ...fetchedStory, title: draft.title };
      }
    }
    setLoadedStory(next);
    setIsStoryLoaded(true);
  }, [missingParams, fetchedStory, projectId, storyNumber]);

  useEffect(() => {
    if (missingParams) {
      return;
    }
    if (detailLoading) {
      return;
    }
    if (fetchedStory) {
      setForbidden(null);
      setRequestError(null);
      return;
    }

    if (errorStatus === 401) {
      notifySessionExpired();
      return;
    }
    if (errorStatus === 403) {
      setForbidden(detailError ?? t("storyEditScreen.errors.forbidden"));
      return;
    }
    if (errorStatus === 404) {
      setRequestError(detailError ?? t("storyEditScreen.errors.notFound"));
      return;
    }
    setRequestError(detailError ?? t("storyEditScreen.errors.loadFailed"));
  }, [
    missingParams,
    detailLoading,
    fetchedStory,
    errorStatus,
    detailError,
    notifySessionExpired,
    t,
  ]);

  useEffect(() => {
    if (!projectId || !storyNumber || !isStoryLoaded || !loadedStory) {
      return;
    }
    saveDraft(draftKey(projectId, storyNumber), {
      title: loadedStory.title,
    });
  }, [projectId, storyNumber, isStoryLoaded, loadedStory]);

  useEffect(() => {
    retryRequestRef.current = invalidateStoryEditQueries;
  }, [invalidateStoryEditQueries]);

  const displayLoadError = missingParams
    ? t("storyEditScreen.errors.notFound")
    : requestError;

  const handleConfirmDelete = async () => {
    if (!pendingDeleteStory || !projectId) {
      return;
    }

    retryRequestRef.current = () => {
      void handleConfirmDelete();
    };
    setDeletingStoryId(pendingDeleteStory.id);

    try {
      const response = await fetch(
        `${projectStoriesApiPath(projectId)}/${pendingDeleteStory.id}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (isForbiddenError(response.status)) {
          const message = await parseErrorMessage(response);
          setForbidden(message);
          showToast(
            "error",
            t("storyEditScreen.errors.deleteFailedWithMessage", { message }),
          );
          return;
        }
        const message = await parseErrorMessage(response);
        setRequestError(message);
        showToast(
          "error",
          t("storyEditScreen.errors.deleteFailedWithMessage", { message }),
        );
        return;
      }

      clearDraft(draftKey(projectId, pendingDeleteStory.id));
      showToast(
        "success",
        t("storyEditScreen.toast.deleted", { title: pendingDeleteStory.title }),
      );
      setPendingDeleteStory(null);
      navigate(storiesPath);
    } catch {
      showToast("error", t("storyEditScreen.errors.deleteRetry"));
      setRequestError(t("storyEditScreen.errors.deleteFailed"));
    } finally {
      setDeletingStoryId(null);
      retryRequestRef.current = invalidateStoryEditQueries;
    }
  };

  if (forbidden) {
    return (
      <PermissionDenied
        message={forbidden}
        nextAction={t("storyEditScreen.permission.nextAction")}
        retryHint={t("storyEditScreen.permission.retryHint")}
        onRetry={() => {
          setForbidden(null);
          void retryRequestRef.current?.();
        }}
        backTo={storiesPath}
        backLabel={t("storyEditScreen.backToStories")}
      />
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm">
        <ProjectStoryBreadcrumb
          projectId={projectId}
          currentPageLabel={t("storyEditScreen.title")}
        />
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {t("storyEditScreen.title")}
          </h1>
          <Link className="text-sm font-medium text-blue-700" to={storiesPath}>
            {t("storyEditScreen.backToStories")}
          </Link>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          {t("storyEditScreen.description")}
        </p>

        {isLoading ? (
          <p className="mt-6 text-gray-600">{t("storyEditScreen.loading")}</p>
        ) : null}

        {!isLoading && displayLoadError && !loadedStory ? (
          <p className="mt-6 text-sm text-red-600" role="alert">
            {displayLoadError}
          </p>
        ) : null}

        {!isLoading && loadedStory ? (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white">
            <StoryAccordionDetail
              story={loadedStory}
              mentionCandidates={memberOptions}
              onStoryUpdated={setLoadedStory}
            />
          </div>
        ) : null}
      </div>

      <StoryDeleteConfirmDialog
        isOpen={pendingDeleteStory !== null}
        storyTitle={pendingDeleteStory?.title ?? ""}
        isDeleting={
          pendingDeleteStory !== null &&
          deletingStoryId === pendingDeleteStory.id
        }
        onCancel={() => setPendingDeleteStory(null)}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
      />
    </main>
  );
}
