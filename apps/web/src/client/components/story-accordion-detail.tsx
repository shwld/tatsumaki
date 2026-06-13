import {
  type InfiniteData,
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type FormEvent,
  type ReactNode,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuthError } from "../contexts/auth-error-context";
import { useToast } from "../contexts/toast-context";
import { storyQueryKeys } from "../hooks/story-query-keys";
import { useCurrentUser } from "../hooks/use-current-user";
import { useProjectBootstrap } from "../hooks/use-project-bootstrap";
import { useStoryDetail, useStoryTimeline } from "../hooks/use-story-detail";
import { useStoryPatch } from "../hooks/use-story-patch";
import { isAuthError, isForbiddenError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import { convertLegacyMentionsToMentionLinks } from "../lib/mention-markdown";
import {
  projectStoriesApiPath,
  projectStoryAttachmentContentApiPath,
  projectStoryAttachmentsApiPath,
  projectStoryBlockersApiPath,
  projectStoryCommentApiPath,
  projectStoryCommentsApiPath,
} from "../lib/story-routes";
import {
  STORY_STATUS_LABELS,
  listSelectableStoryStatuses,
} from "../lib/story-status";
import { shouldShowPointEstimation } from "../lib/story-estimation";
import { groupStoryTimelineEntriesByPostDate } from "../lib/story-timeline-grouping";
import { formatStoryTimelineSummary } from "../lib/story-timeline-ui";
import type { FieldErrors } from "../types/form";
import type {
  Story,
  StoryAttachment,
  StoriesResponse,
  StoryStatus,
  StoryTimelineCommentEntry,
} from "../types/story";
import { DEFAULT_STORY_POINTS as FALLBACK_STORY_POINTS } from "../types/story";
import { EditableMarkdown } from "./editable-markdown";
import { LabelMultiSelect } from "./label-multi-select";
import { MarkdownPreview } from "./markdown-preview";
import { RichTextEditor } from "./rich-text-editor";
import { StoryAccordionAttachmentsSection } from "./story-accordion-attachments-section";
import { StoryAccordionBlockersSection } from "./story-accordion-blockers-section";
import type { ProjectMemberProfile } from "../types/project";
import { Avatar } from "./avatar";

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** タイムラインの actor id と /api/auth/me の id を突き合わせる（前後空白のズレを吸収） */
function userIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  return a.trim() === b.trim();
}

type StoryAccordionDetailProps = {
  story: Story;
  mentionCandidates?: ProjectMemberProfile[];
  onStoryUpdated?: (story: Story) => void;
};

type PanelStoriesPage = {
  stories: Story[];
  pagination: StoriesResponse["pagination"];
};

function StoryAccordionDetailComponent({
  story,
  mentionCandidates = [],
  onStoryUpdated,
}: StoryAccordionDetailProps) {
  const queryClient = useQueryClient();
  const { notifySessionExpired } = useAuthError();
  const { showToast } = useToast();
  const [metadataFieldErrors, setMetadataFieldErrors] = useState<FieldErrors>(
    {},
  );
  const {
    patchStory,
    isSaving: isPatchSaving,
    syncStoryUpdate,
  } = useStoryPatch(
    story.projectId,
    String(story.storyNumber),
    onStoryUpdated,
    {
      getOptimisticBaseStory: () => story,
      onValidationError: ({ fieldErrors }) => {
        setMetadataFieldErrors((prev) => ({ ...prev, ...fieldErrors }));
      },
    },
  );
  const { data: bootstrap } = useProjectBootstrap(story.projectId);
  const projectLabels = bootstrap?.projectLabels ?? [];
  const { user: viewer } = useCurrentUser();
  const memberOptionsResolved = useMemo(() => {
    const byId = new Map<string, ProjectMemberProfile>();
    for (const m of mentionCandidates) {
      if (!byId.has(m.id)) {
        byId.set(m.id, m);
      }
    }
    for (const m of bootstrap?.memberOptions ?? []) {
      byId.set(m.id, m);
    }
    return Array.from(byId.values());
  }, [mentionCandidates, bootstrap?.memberOptions]);

  const { story: detailedStory, isLoading: isStoryDetailLoading } =
    useStoryDetail(story.projectId, String(story.storyNumber));
  const resolvedStory = detailedStory ?? story;

  const {
    timeline,
    isLoading: isTimelineLoading,
    error: timelineError,
    refresh: refreshTimeline,
    loadMore: loadMoreTimeline,
    hasMore: hasMoreTimeline,
    isLoadingMore: isTimelineLoadingMore,
  } = useStoryTimeline(story.projectId, String(story.storyNumber));

  const [blockerStorySearch, setBlockerStorySearch] = useState("");
  const deferredBlockerSearch = useDeferredValue(blockerStorySearch.trim());

  const { data: pickerStories = [] } = useQuery({
    queryKey: storyQueryKeys.projectStoriesBlockerPicker(
      story.projectId,
      deferredBlockerSearch,
    ),
    queryFn: async (): Promise<Story[]> => {
      const response = await fetch(
        projectStoriesApiPath(story.projectId, {
          detail: "summary",
          limit: 200,
          order: "positionAsc",
          ...(deferredBlockerSearch ? { q: deferredBlockerSearch } : {}),
        }),
      );
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
      const data = (await response.json()) as { stories?: Story[] };
      return Array.isArray(data.stories) ? data.stories : [];
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const [commentBody, setCommentBody] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null,
  );
  const isSaving = isPatchSaving;
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [titleDraft, setTitleDraft] = useState(story.title);

  const [selectedAttachmentFile, setSelectedAttachmentFile] =
    useState<File | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);

  const [isUpdatingBlockers, setIsUpdatingBlockers] = useState(false);
  const [selectedBlockingStoryId, setSelectedBlockingStoryId] = useState("");
  const [selectedBlockedStoryId, setSelectedBlockedStoryId] = useState("");

  const selectableStatuses = listSelectableStoryStatuses(resolvedStory.status);
  const pointScale =
    bootstrap?.project?.pointScale && bootstrap.project.pointScale.length > 0
      ? bootstrap.project.pointScale
      : [...FALLBACK_STORY_POINTS];
  const showPointEstimation = shouldShowPointEstimation(
    resolvedStory.type,
    bootstrap?.project?.estimateBugs ?? true,
    bootstrap?.project?.estimateChores ?? true,
  );

  const handleLabelsChange = useCallback(
    (labels: string[]) => {
      setSelectedLabels(labels);
      if (sameStringArray(labels, resolvedStory.labels)) return;
      void patchStory({ labels });
    },
    [patchStory, resolvedStory.labels],
  );

  const timelineGroups = useMemo(
    () => groupStoryTimelineEntriesByPostDate(timeline),
    [timeline],
  );

  useEffect(() => {
    setSelectedLabels(resolvedStory.labels);
    setTitleDraft(resolvedStory.title);
    setMetadataFieldErrors({});
  }, [resolvedStory.id]);

  const attachmentsQuery = useQuery({
    queryKey: storyQueryKeys.storyAttachments(story.projectId, story.id),
    queryFn: async (): Promise<StoryAttachment[]> => {
      const response = await fetch(
        projectStoryAttachmentsApiPath(
          story.projectId,
          String(story.storyNumber),
        ),
      );
      if (isAuthError(response.status)) {
        notifySessionExpired();
        throw new Error("セッションの有効期限が切れています");
      }
      if (isForbiddenError(response.status)) {
        throw new Error(await parseErrorMessage(response));
      }
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
      const data = (await response.json()) as {
        attachments?: StoryAttachment[];
      };
      return Array.isArray(data.attachments) ? data.attachments : [];
    },
    staleTime: 60_000,
  });

  const attachments = attachmentsQuery.data ?? [];
  const attachmentsError =
    attachmentsQuery.error instanceof Error
      ? attachmentsQuery.error.message
      : null;
  const isAttachmentsLoading =
    attachmentsQuery.isPending ||
    (attachmentsQuery.isFetching && !attachmentsQuery.data);

  const invalidateAttachments = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: storyQueryKeys.storyAttachments(story.projectId, story.id),
    });
  }, [queryClient, story.id, story.projectId]);

  const handleSaveDescription = useCallback(
    (value: string) => {
      void patchStory({ description: value });
    },
    [patchStory],
  );

  const uploadPastedImageToStory = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const formData = new FormData();
        formData.set("file", file);
        const response = await fetch(
          projectStoryAttachmentsApiPath(
            story.projectId,
            String(story.storyNumber),
          ),
          {
            method: "POST",
            body: formData,
          },
        );
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return null;
        }
        if (!response.ok) {
          const message = await parseErrorMessage(response);
          showToast("error", message || "画像のアップロードに失敗しました");
          return null;
        }
        const data = (await response.json()) as {
          attachment?: StoryAttachment;
        };
        const attachmentId = data.attachment?.id;
        if (!attachmentId) {
          showToast("error", "画像のアップロードに失敗しました");
          return null;
        }
        showToast("success", "画像をアップロードしました");
        invalidateAttachments();
        void refreshTimeline();
        return projectStoryAttachmentContentApiPath(
          story.projectId,
          String(story.storyNumber),
          attachmentId,
        );
      } catch {
        showToast("error", "画像のアップロードに失敗しました");
        return null;
      }
    },
    [
      story.projectId,
      story.id,
      notifySessionExpired,
      showToast,
      invalidateAttachments,
      refreshTimeline,
    ],
  );

  const handleUploadAttachment = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedAttachmentFile) {
        return;
      }

      setIsUploadingAttachment(true);
      try {
        const formData = new FormData();
        formData.set("file", selectedAttachmentFile);

        const response = await fetch(
          projectStoryAttachmentsApiPath(
            story.projectId,
            String(story.storyNumber),
          ),
          {
            method: "POST",
            body: formData,
          },
        );

        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (isForbiddenError(response.status)) {
          showToast("error", await parseErrorMessage(response));
          return;
        }
        if (!response.ok) {
          showToast("error", await parseErrorMessage(response));
          return;
        }

        setSelectedAttachmentFile(null);
        showToast("success", "添付ファイルをアップロードしました");
        invalidateAttachments();
        void refreshTimeline();
      } catch {
        showToast("error", "添付ファイルのアップロードに失敗しました");
      } finally {
        setIsUploadingAttachment(false);
      }
    },
    [
      notifySessionExpired,
      invalidateAttachments,
      refreshTimeline,
      selectedAttachmentFile,
      showToast,
      story.id,
      story.projectId,
    ],
  );

  const handleDeleteAttachment = useCallback(
    async (attachmentId: string) => {
      setDeletingAttachmentId(attachmentId);
      try {
        const response = await fetch(
          `${projectStoryAttachmentsApiPath(story.projectId, String(story.storyNumber))}/${attachmentId}`,
          {
            method: "DELETE",
          },
        );

        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (isForbiddenError(response.status)) {
          showToast("error", await parseErrorMessage(response));
          return;
        }
        if (!response.ok) {
          showToast("error", await parseErrorMessage(response));
          return;
        }

        showToast("success", "添付ファイルを削除しました");
        invalidateAttachments();
        void refreshTimeline();
      } catch {
        showToast("error", "添付ファイルの削除に失敗しました");
      } finally {
        setDeletingAttachmentId(null);
      }
    },
    [
      notifySessionExpired,
      invalidateAttachments,
      refreshTimeline,
      showToast,
      story.id,
      story.projectId,
    ],
  );

  const updateBlocker = useCallback(
    async (
      method: "POST" | "DELETE",
      relation: "blockedBy" | "blocks",
      targetStoryId: string,
    ) => {
      if (!targetStoryId) {
        return;
      }

      setIsUpdatingBlockers(true);

      try {
        const response = await fetch(
          projectStoryBlockersApiPath(
            story.projectId,
            String(story.storyNumber),
          ),
          {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              relation,
              targetStoryId,
            }),
          },
        );

        if (!response.ok) {
          if (isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          showToast("error", await parseErrorMessage(response));
          return;
        }

        const data = (await response.json()) as {
          story: Story;
          relatedStory?: Story;
        };
        syncStoryUpdate(data.story);
        if (data.relatedStory) {
          queryClient.setQueryData(
            storyQueryKeys.storyDetail(
              data.relatedStory.projectId,
              String(data.relatedStory.storyNumber),
            ),
            data.relatedStory,
          );
          queryClient.setQueriesData<
            InfiniteData<PanelStoriesPage, number> | undefined
          >(
            {
              queryKey: storyQueryKeys.panelStoriesRoot(story.projectId),
            },
            (currentData) => {
              if (!currentData) {
                return currentData;
              }
              let changed = false;
              const nextPages = currentData.pages.map((page) => {
                let pageChanged = false;
                const nextStories = page.stories.map((candidate) => {
                  if (candidate.id === data.story.id) {
                    pageChanged = true;
                    changed = true;
                    return data.story;
                  }
                  if (candidate.id === data.relatedStory?.id) {
                    pageChanged = true;
                    changed = true;
                    return data.relatedStory;
                  }
                  return candidate;
                });
                if (!pageChanged) {
                  return page;
                }
                return {
                  ...page,
                  stories: nextStories,
                };
              });
              if (!changed) {
                return currentData;
              }
              return {
                ...currentData,
                pages: nextPages,
              };
            },
          );
        }
        void queryClient.invalidateQueries({
          queryKey: storyQueryKeys.panelStoriesRoot(story.projectId),
          refetchType: "active",
        });
        void refreshTimeline();
      } catch {
        showToast("error", "ブロッカーの更新に失敗しました");
      } finally {
        setIsUpdatingBlockers(false);
      }
    },
    [
      notifySessionExpired,
      refreshTimeline,
      showToast,
      story.id,
      story.projectId,
      syncStoryUpdate,
      queryClient,
    ],
  );

  const availableStories = useMemo(() => {
    return pickerStories.filter((s) => s.id !== story.id);
  }, [pickerStories, story.id]);

  const availableBlockingStories = useMemo(() => {
    return availableStories.filter((s) => {
      return !resolvedStory.blockingStories?.some((rel) => rel.id === s.id);
    });
  }, [availableStories, resolvedStory.blockingStories]);

  const availableBlockedStories = useMemo(() => {
    return availableStories.filter((s) => {
      return !resolvedStory.blockedStories?.some((rel) => rel.id === s.id);
    });
  }, [availableStories, resolvedStory.blockedStories]);

  const handleSubmitComment = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!commentBody.trim()) return;
      const normalizedBody = convertLegacyMentionsToMentionLinks(
        commentBody,
        memberOptionsResolved,
      );

      setIsSubmittingComment(true);
      try {
        const response = await fetch(
          projectStoryCommentsApiPath(
            story.projectId,
            String(story.storyNumber),
          ),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body: normalizedBody }),
          },
        );
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (!response.ok) {
          showToast("error", "コメントの投稿に失敗しました");
          return;
        }
        setCommentBody("");
        refreshTimeline();
      } catch {
        showToast("error", "コメントの投稿に失敗しました");
      } finally {
        setIsSubmittingComment(false);
      }
    },
    [
      commentBody,
      memberOptionsResolved,
      story.projectId,
      story.id,
      refreshTimeline,
      notifySessionExpired,
      showToast,
    ],
  );

  const handleUpdateComment = useCallback(
    async (commentId: string, body: string) => {
      const normalizedBody = convertLegacyMentionsToMentionLinks(
        body,
        memberOptionsResolved,
      );
      try {
        const response = await fetch(
          projectStoryCommentApiPath(
            story.projectId,
            String(story.storyNumber),
            commentId,
          ),
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body: normalizedBody }),
          },
        );
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (!response.ok) {
          showToast("error", "コメントの更新に失敗しました");
          return;
        }
        refreshTimeline();
      } catch {
        showToast("error", "コメントの更新に失敗しました");
      }
    },
    [
      story.projectId,
      story.id,
      memberOptionsResolved,
      refreshTimeline,
      notifySessionExpired,
      showToast,
    ],
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      setDeletingCommentId(commentId);
      try {
        const response = await fetch(
          projectStoryCommentApiPath(
            story.projectId,
            String(story.storyNumber),
            commentId,
          ),
          {
            method: "DELETE",
          },
        );
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (!response.ok) {
          showToast("error", "コメントの削除に失敗しました");
          return;
        }
        refreshTimeline();
      } catch {
        showToast("error", "コメントの削除に失敗しました");
      } finally {
        setDeletingCommentId((currentId) => {
          return currentId === commentId ? null : currentId;
        });
      }
    },
    [
      story.projectId,
      story.id,
      refreshTimeline,
      notifySessionExpired,
      showToast,
    ],
  );

  if (timelineError) {
    return (
      <div className="px-3 py-4 text-center text-xs text-red-500">
        {timelineError}
      </div>
    );
  }

  const labelsError = metadataFieldErrors.labels ?? null;
  const storyPointError = metadataFieldErrors.storyPoint ?? null;
  const titleError = metadataFieldErrors.title ?? null;

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <form
        className="space-y-1"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedTitle = titleDraft.trim();
          if (!trimmedTitle || trimmedTitle === resolvedStory.title) {
            setTitleDraft(resolvedStory.title);
            return;
          }
          void patchStory({ title: trimmedTitle });
        }}
      >
        <label
          htmlFor={`story-title-${story.id}`}
          className="text-xs font-medium text-gray-500 dark:text-slate-300"
        >
          タイトル
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`story-title-${story.id}`}
            value={titleDraft}
            disabled={isSaving}
            onChange={(event) => setTitleDraft(event.target.value)}
            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={
              isSaving ||
              titleDraft.trim().length === 0 ||
              titleDraft.trim() === resolvedStory.title
            }
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            保存
          </button>
        </div>
        {titleError ? (
          <p className="text-xs text-red-600" role="alert">
            {titleError}
          </p>
        ) : null}
      </form>

      <div className="flex min-w-0 items-center gap-2">
        <label
          htmlFor={`story-status-${story.id}`}
          className="shrink-0 text-xs font-medium text-gray-500 dark:text-slate-300"
        >
          ステータス
        </label>
        <select
          id={`story-status-${story.id}`}
          className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
          value={resolvedStory.status}
          disabled={isSaving}
          onChange={(event) => {
            void patchStory({
              status: event.target.value as StoryStatus,
            });
          }}
        >
          {selectableStatuses.map((status) => (
            <option key={status} value={status}>
              {STORY_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-xs">
        <span className="shrink-0 font-medium text-gray-500 dark:text-slate-300">
          ラベル
        </span>
        <LabelMultiSelect
          projectId={story.projectId}
          selectedLabels={selectedLabels}
          projectLabels={projectLabels}
          disabled={isSaving}
          onSelectedLabelsChange={handleLabelsChange}
        />
      </div>

      {labelsError ? (
        <p className="text-xs text-red-600" role="alert">
          {labelsError}
        </p>
      ) : null}

      {showPointEstimation ? (
        <div className="flex min-w-0 items-center gap-2">
          <label
            htmlFor={`story-point-${story.id}`}
            className="shrink-0 text-xs font-medium text-gray-500 dark:text-slate-300"
          >
            ポイント
          </label>
          <select
            id={`story-point-${story.id}`}
            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400"
            value={
              resolvedStory.storyPoint == null ? "" : resolvedStory.storyPoint
            }
            disabled={isSaving}
            onChange={(event) => {
              const next =
                event.target.value === "" ? null : Number(event.target.value);
              if (next === resolvedStory.storyPoint) return;
              void patchStory({ storyPoint: next });
            }}
          >
            <option value="">未設定</option>
            {pointScale.map((point) => (
              <option key={point} value={point}>
                {point}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {storyPointError ? (
        <p className="text-xs text-red-600" role="alert">
          {storyPointError}
        </p>
      ) : null}

      <div>
        <h4 className="text-xs font-medium text-gray-500 dark:text-slate-300">
          説明
        </h4>
        <EditableMarkdown
          value={resolvedStory.description}
          onSave={handleSaveDescription}
          mentionCandidates={memberOptionsResolved}
          placeholder="説明を追加..."
          uploadPastedImage={uploadPastedImageToStory}
        />
        {isStoryDetailLoading ? (
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-400">
            詳細を読み込み中...
          </p>
        ) : null}
      </div>

      <StoryAccordionAttachmentsSection
        storyId={story.id}
        projectId={story.projectId}
        attachments={attachments}
        attachmentsError={attachmentsError}
        isAttachmentsLoading={isAttachmentsLoading}
        selectedAttachmentFile={selectedAttachmentFile}
        onAttachmentFileChange={setSelectedAttachmentFile}
        isUploadingAttachment={isUploadingAttachment}
        onUploadSubmit={handleUploadAttachment}
        deletingAttachmentId={deletingAttachmentId}
        onDeleteAttachment={handleDeleteAttachment}
      />

      <StoryAccordionBlockersSection
        storyId={story.id}
        resolvedStory={resolvedStory}
        blockerStorySearch={blockerStorySearch}
        onBlockerStorySearchChange={setBlockerStorySearch}
        isUpdatingBlockers={isUpdatingBlockers}
        selectedBlockingStoryId={selectedBlockingStoryId}
        onSelectedBlockingStoryIdChange={setSelectedBlockingStoryId}
        selectedBlockedStoryId={selectedBlockedStoryId}
        onSelectedBlockedStoryIdChange={setSelectedBlockedStoryId}
        availableBlockingStories={availableBlockingStories}
        availableBlockedStories={availableBlockedStories}
        onUpdateBlocker={updateBlocker}
      />

      <section aria-labelledby={`story-timeline-${story.id}`}>
        <div className="flex items-center justify-between gap-2">
          <h4
            id={`story-timeline-${story.id}`}
            className="text-xs font-semibold text-gray-700 dark:text-slate-200"
          >
            タイムライン
          </h4>
          {isTimelineLoading && !isTimelineLoadingMore ? (
            <span className="text-[10px] text-gray-500">更新中...</span>
          ) : null}
        </div>
        {hasMoreTimeline ? (
          <div className="mt-1">
            <button
              type="button"
              className="text-[11px] font-medium text-blue-700 hover:text-blue-900 disabled:text-gray-400"
              disabled={isTimelineLoadingMore}
              onClick={() => {
                loadMoreTimeline();
              }}
            >
              {isTimelineLoadingMore ? "読み込み中..." : "さらに表示"}
            </button>
          </div>
        ) : null}
        {timeline.length === 0 && !isTimelineLoading ? (
          <p className="mt-1 text-xs text-gray-500">
            まだアクティビティもコメントもありません。
          </p>
        ) : null}
        {timelineGroups.length > 0 ? (
          <div className="mt-2 space-y-4">
            {timelineGroups.map((group) => (
              <div key={group.dateKey}>
                <h5 className="mb-2 border-b border-gray-100 pb-1 text-xs font-semibold text-gray-600 dark:border-slate-700 dark:text-slate-300">
                  {group.dateLabel}
                </h5>
                <ul className="space-y-2">
                  {group.entries.map((entry) =>
                    entry.entryType === "activity" ? (
                      <li
                        key={`${entry.entryType}-${entry.id}`}
                        className="rounded border border-gray-100 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-slate-300">
                            {(() => {
                              const actor = memberOptionsResolved.find((m) =>
                                userIdsEqual(m.id, entry.actorUserId),
                              );
                              const displayName =
                                actor?.displayName ?? entry.actorName;
                              return (
                                <>
                                  <Avatar
                                    displayName={displayName}
                                    avatarUrl={actor?.avatarUrl ?? null}
                                    gravatarUrl={actor?.gravatarUrl ?? null}
                                    size="sm"
                                  />
                                  {displayName}
                                </>
                              );
                            })()}
                          </span>
                          <span className="shrink-0 text-[10px] text-gray-400 dark:text-slate-500">
                            {new Date(entry.createdAt).toLocaleTimeString(
                              "ja-JP",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                        </div>
                        <CollapsibleTimelineContent>
                          <MarkdownPreview
                            content={formatStoryTimelineSummary(entry)}
                            className="prose-p:my-1 prose-headings:my-1"
                          />
                        </CollapsibleTimelineContent>
                      </li>
                    ) : (
                      <li key={`${entry.entryType}-${entry.id}`}>
                        <CommentItem
                          comment={entry}
                          actorProfile={memberOptionsResolved.find((m) =>
                            userIdsEqual(m.id, entry.actorUserId),
                          )}
                          mentionCandidates={memberOptionsResolved}
                          uploadPastedImage={uploadPastedImageToStory}
                          viewerUserId={viewer?.id ?? null}
                          viewerEmail={viewer?.email ?? null}
                          viewerDisplayName={viewer?.displayName ?? null}
                          canMutateComment={userIdsEqual(
                            viewer?.id,
                            entry.actorUserId,
                          )}
                          onSave={(body) => {
                            void handleUpdateComment(entry.id, body);
                          }}
                          onDelete={() => {
                            void handleDeleteComment(entry.id);
                          }}
                          isDeleting={deletingCommentId === entry.id}
                        />
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            void handleSubmitComment(e);
          }}
          className="mt-3"
        >
          <RichTextEditor
            value={commentBody}
            mentionCandidates={memberOptionsResolved}
            placeholder="コメントを追加..."
            minHeightClassName="min-h-20"
            onChange={setCommentBody}
            uploadPastedImage={uploadPastedImageToStory}
          />
          <div className="mt-1 flex justify-end">
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700 dark:bg-blue-500 dark:hover:bg-blue-400 dark:disabled:bg-slate-600 dark:disabled:text-slate-200"
              disabled={!commentBody.trim() || isSubmittingComment}
            >
              {isSubmittingComment ? "投稿中..." : "投稿"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CollapsibleTimelineContent({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div className={`relative ${expanded ? "" : "max-h-24 overflow-hidden"}`}>
        {children}
        {!expanded && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--color-surface)] to-transparent" />
        )}
      </div>
      <button
        type="button"
        className="mt-1 text-[10px] font-medium text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "折りたたむ" : "展開"}
      </button>
    </div>
  );
}

type CommentItemProps = {
  comment: StoryTimelineCommentEntry;
  actorProfile?: ProjectMemberProfile;
  mentionCandidates: ProjectMemberProfile[];
  uploadPastedImage?: (file: File) => Promise<string | null>;
  viewerUserId: string | null;
  viewerEmail: string | null;
  viewerDisplayName: string | null;
  canMutateComment: boolean;
  onSave: (body: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
};

const CommentItem = memo(function CommentItem({
  comment,
  actorProfile,
  mentionCandidates,
  uploadPastedImage,
  viewerUserId,
  viewerEmail,
  viewerDisplayName,
  canMutateComment,
  onSave,
  onDelete,
  isDeleting,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const authorProfile =
    actorProfile && userIdsEqual(actorProfile.id, comment.actorUserId)
      ? actorProfile
      : undefined;
  const actorLabelMismatch =
    Boolean(viewerUserId) &&
    userIdsEqual(comment.actorUserId, viewerUserId) &&
    comment.actorName !== viewerEmail &&
    comment.actorName !== viewerUserId &&
    comment.actorName !== viewerDisplayName;
  const displayName = actorLabelMismatch
    ? comment.actorName
    : (authorProfile?.displayName ?? comment.actorName);
  const avatarUrl =
    actorLabelMismatch || !authorProfile ? null : authorProfile.avatarUrl;
  const gravatarUrl =
    actorLabelMismatch || !authorProfile ? null : authorProfile.gravatarUrl;

  return (
    <div className="rounded border border-gray-100 p-2 dark:border-slate-700">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-slate-300">
          <Avatar
            displayName={displayName}
            avatarUrl={avatarUrl}
            gravatarUrl={gravatarUrl}
            size="sm"
          />
          {displayName}
        </span>
        <span className="shrink-0 text-[10px] text-gray-400 dark:text-slate-500">
          {new Date(comment.createdAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {editing ? (
        <EditableMarkdown
          value={comment.body}
          onSave={(body) => {
            onSave(body);
            setEditing(false);
          }}
          mentionCandidates={mentionCandidates}
          uploadPastedImage={uploadPastedImage}
        />
      ) : (
        <MarkdownPreview
          content={convertLegacyMentionsToMentionLinks(
            comment.body,
            mentionCandidates,
          )}
          className="prose-p:my-1 prose-headings:my-1"
        />
      )}
      {canMutateComment ? (
        <div className="mt-2 flex justify-end gap-2">
          {editing ? (
            <button
              type="button"
              className="text-xs text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-slate-100"
              onClick={() => setEditing(false)}
            >
              閉じる
            </button>
          ) : (
            <button
              type="button"
              className="text-xs text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
              onClick={() => setEditing(true)}
            >
              編集
            </button>
          )}
          <button
            type="button"
            className="text-xs text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-red-300"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "削除中..." : "削除"}
          </button>
        </div>
      ) : null}
    </div>
  );
});

export const StoryAccordionDetail = memo(StoryAccordionDetailComponent);
