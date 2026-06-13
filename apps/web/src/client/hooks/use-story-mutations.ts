import { useMutation } from "@tanstack/react-query";

import {
  planStoryMoveToPanel,
  type PanelMovePlan,
} from "../lib/story-panel-transition";
import { STORY_STATUS_LABELS } from "../lib/story-status";
import { isAuthError, isForbiddenError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import {
  projectBulkStoryLabelsApiPath,
  projectBulkStoryStatusApiPath,
  projectIterationStoriesApiPath,
  projectIterationStoryApiPath,
  projectStoriesApiPath,
} from "../lib/story-routes";
import type { PanelType } from "../lib/panel-visibility";
import type { Story, StoryStatus } from "../types/story";
import type {
  PanelRollbackSnapshot,
  usePanelStoriesQuery,
} from "./use-panel-stories-query";

const ALL_PANELS: PanelType[] = ["Done", "Current", "Backlog", "Icebox"];
const IN_PROGRESS_STATUSES: Set<StoryStatus> = new Set([
  "Started",
  "Finished",
  "Delivered",
]);
const BACKLOG_STATUSES: Set<StoryStatus> = new Set(["Unstarted", "Rejected"]);

/** Icebox 上のストーリーが進行中系へ遷移するとき、Current 相当へ揃えるため Icebox から外す。 */
function shouldClearIceboxForStatus(
  story: Story,
  nextStatus: StoryStatus,
): boolean {
  return story.isIcebox && IN_PROGRESS_STATUSES.has(nextStatus);
}

type StoryMutationErrorCode = "AUTH" | "FORBIDDEN" | "REQUEST" | "CONFLICT";

class StoryMutationError extends Error {
  constructor(
    readonly code: StoryMutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StoryMutationError";
  }
}

export type StatusMutationVariables = {
  story: Story;
  nextStatus: StoryStatus;
  currentIterationId: string | null;
};

export type MovePanelMutationVariables = {
  story: Story;
  targetPanel: PanelType;
  plan: Extract<PanelMovePlan, { ok: true }>;
};

export type DeleteStoryMutationVariables = {
  story: Story;
};

export type BulkStatusMutationVariables = {
  storyIds: string[];
  stories: Story[];
  status: StoryStatus;
  currentIterationId: string | null;
};

export type BulkLabelMutationVariables = {
  storyIds: string[];
  stories: Story[];
  labelName: string;
};

type MutationContext = {
  snapshot: PanelRollbackSnapshot;
};

type UseStoryMutationsInput = {
  projectId: string | undefined;
  panelQueries: ReturnType<typeof usePanelStoriesQuery>;
  notifySessionExpired: () => void;
  setForbidden: (message: string) => void;
  setError: (message: string | null) => void;
  showToast: (kind: "success" | "error", message: string) => void;
};

async function parseResponseError(response: Response): Promise<string> {
  return parseErrorMessage(response);
}

export function useStoryMutations({
  projectId,
  panelQueries,
  notifySessionExpired,
  setForbidden,
  setError,
  showToast,
}: UseStoryMutationsInput) {
  const ensureProjectId = (): string => {
    if (!projectId) {
      throw new StoryMutationError("REQUEST", "プロジェクトが見つかりません。");
    }
    return projectId;
  };

  const handleErrorResponse = async (response: Response) => {
    if (isAuthError(response.status)) {
      notifySessionExpired();
      throw new StoryMutationError("AUTH", "Unauthorized");
    }

    if (isForbiddenError(response.status)) {
      const message = await parseResponseError(response);
      setForbidden(message);
      throw new StoryMutationError("FORBIDDEN", message);
    }

    if (response.status === 409) {
      throw new StoryMutationError(
        "CONFLICT",
        await parseResponseError(response),
      );
    }

    throw new StoryMutationError("REQUEST", await parseResponseError(response));
  };

  const patchStory = async (
    safeProjectId: string,
    storyNumber: string,
    body: Record<string, unknown>,
  ): Promise<Story> => {
    const response = await fetch(
      `${projectStoriesApiPath(safeProjectId)}/${storyNumber}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      await handleErrorResponse(response);
    }
    const data = (await response.json()) as { story: Story };
    return data.story;
  };

  const rollbackOnError = (
    error: Error,
    context: MutationContext | undefined,
    fallbackMessage: string,
  ) => {
    if (context?.snapshot) {
      panelQueries.restorePanelsSnapshot(context.snapshot);
    }

    if (error instanceof StoryMutationError) {
      if (error.code === "CONFLICT") {
        setError(null);
        showToast("error", error.message);
        return;
      }
      if (error.code === "REQUEST") {
        setError(error.message);
        showToast("error", fallbackMessage);
      }
      return;
    }

    setError(fallbackMessage);
    showToast("error", fallbackMessage);
  };

  const statusMutation = useMutation<
    Story,
    Error,
    StatusMutationVariables,
    MutationContext
  >({
    mutationFn: async ({ story, nextStatus, currentIterationId }) => {
      const safeProjectId = ensureProjectId();
      const shouldAssignCurrentIteration =
        IN_PROGRESS_STATUSES.has(nextStatus) && story.iterationId === null;

      if (shouldAssignCurrentIteration) {
        if (!currentIterationId) {
          throw new StoryMutationError(
            "REQUEST",
            "現在のイテレーションが見つからないため、進行中ステータスに変更できません。",
          );
        }

        const assignResponse = await fetch(
          projectIterationStoriesApiPath(safeProjectId, currentIterationId),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ storyId: story.id }),
          },
        );
        if (!assignResponse.ok) {
          await handleErrorResponse(assignResponse);
        }
      }

      const clearIcebox = shouldClearIceboxForStatus(story, nextStatus);
      return patchStory(safeProjectId, String(story.storyNumber), {
        status: nextStatus,
        ...(clearIcebox ? { isIcebox: false } : {}),
      });
    },
    onMutate: async ({ story, nextStatus, currentIterationId }) => {
      const shouldAssignCurrentIteration =
        IN_PROGRESS_STATUSES.has(nextStatus) &&
        story.iterationId === null &&
        currentIterationId !== null;
      const shouldClearIteration =
        BACKLOG_STATUSES.has(nextStatus) &&
        story.iterationId !== null &&
        (currentIterationId === null ||
          story.iterationId !== currentIterationId);
      const clearIcebox = shouldClearIceboxForStatus(story, nextStatus);

      await panelQueries.cancelPanels({ panels: ALL_PANELS });
      const snapshot = panelQueries.snapshotPanels({ panels: ALL_PANELS });
      panelQueries.applyStoryUpdate({
        ...story,
        status: nextStatus,
        iterationId: shouldAssignCurrentIteration
          ? currentIterationId
          : shouldClearIteration
            ? null
            : story.iterationId,
        isIcebox: clearIcebox ? false : story.isIcebox,
      });
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      rollbackOnError(
        error,
        context,
        "ステータスの更新に失敗しました。再度お試しください。",
      );
    },
    onSuccess: (story, variables) => {
      panelQueries.applyStoryUpdate(story);
      setError(null);
      showToast(
        "success",
        `「${variables.story.title}」を${STORY_STATUS_LABELS[variables.nextStatus]}に変更しました`,
      );
    },
    onSettled: () => {
      void panelQueries.invalidatePanels({
        panels: ALL_PANELS,
        refetchType: "none",
      });
    },
  });

  const movePanelMutation = useMutation<
    Story,
    Error,
    MovePanelMutationVariables,
    MutationContext
  >({
    mutationFn: async ({ story, plan }) => {
      const safeProjectId = ensureProjectId();
      let latestStory = story;

      for (const status of plan.statusPath) {
        latestStory = await patchStory(
          safeProjectId,
          String(story.storyNumber),
          { status },
        );
      }

      if (plan.targetIterationId !== latestStory.iterationId) {
        if (plan.targetIterationId) {
          const assignResponse = await fetch(
            projectIterationStoriesApiPath(
              safeProjectId,
              plan.targetIterationId,
            ),
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ storyId: story.id }),
            },
          );
          if (!assignResponse.ok) {
            await handleErrorResponse(assignResponse);
          }
          latestStory = { ...latestStory, iterationId: plan.targetIterationId };
        } else if (latestStory.iterationId) {
          const unassignResponse = await fetch(
            projectIterationStoryApiPath(
              safeProjectId,
              latestStory.iterationId,
              story.id,
            ),
            { method: "DELETE" },
          );
          if (!unassignResponse.ok) {
            await handleErrorResponse(unassignResponse);
          }
          latestStory = { ...latestStory, iterationId: null };
        }
      }

      if (plan.targetIsIcebox !== latestStory.isIcebox) {
        latestStory = await patchStory(
          safeProjectId,
          String(story.storyNumber),
          {
            isIcebox: plan.targetIsIcebox,
          },
        );
      }

      return latestStory;
    },
    onMutate: async ({ story, plan }) => {
      await panelQueries.cancelPanels({ panels: ALL_PANELS });
      const snapshot = panelQueries.snapshotPanels({ panels: ALL_PANELS });
      panelQueries.applyStoryUpdate({
        ...story,
        status: plan.targetStatus,
        iterationId: plan.targetIterationId,
        isIcebox: plan.targetIsIcebox,
      });
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      rollbackOnError(
        error,
        context,
        "パネル移動に失敗しました。再度お試しください。",
      );
    },
    onSuccess: (story, variables) => {
      panelQueries.applyStoryUpdate(story);
      setError(null);
      const message =
        variables.targetPanel === "Current"
          ? "ストーリーをCurrentに移動しました"
          : variables.targetPanel === "Backlog"
            ? "ストーリーをBacklogに移動しました"
            : "ストーリーをIceboxに移動しました";
      showToast("success", message);
    },
    onSettled: () => {
      void panelQueries.invalidatePanels({
        panels: ALL_PANELS,
        refetchType: "none",
      });
    },
  });

  const deleteStoryMutation = useMutation<
    void,
    Error,
    DeleteStoryMutationVariables,
    MutationContext
  >({
    mutationFn: async ({ story }) => {
      const safeProjectId = ensureProjectId();
      const response = await fetch(
        `${projectStoriesApiPath(safeProjectId)}/${String(story.storyNumber)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        await handleErrorResponse(response);
      }
    },
    onMutate: async ({ story }) => {
      await panelQueries.cancelPanels({ panels: ALL_PANELS });
      const snapshot = panelQueries.snapshotPanels({ panels: ALL_PANELS });
      panelQueries.removeStory(story.id);
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      rollbackOnError(
        error,
        context,
        "ストーリーの削除に失敗しました。再度お試しください。",
      );
    },
    onSuccess: (_data, variables) => {
      setError(null);
      showToast("success", `「${variables.story.title}」を削除しました`);
    },
    onSettled: () => {
      void panelQueries.invalidatePanels({
        panels: ALL_PANELS,
        refetchType: "none",
      });
    },
  });

  // 一括 PATCH は API 側の挙動に依存。Icebox+進行中系のイテレーション/icebox 整合は別経路要確認 (follow-up 可)
  const bulkStatusMutation = useMutation<
    Story[],
    Error,
    BulkStatusMutationVariables,
    MutationContext
  >({
    mutationFn: async ({ storyIds, status }) => {
      const safeProjectId = ensureProjectId();
      const response = await fetch(
        projectBulkStoryStatusApiPath(safeProjectId),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storyIds,
            status,
          }),
        },
      );
      if (!response.ok) {
        await handleErrorResponse(response);
      }
      const data = (await response.json()) as { stories: Story[] };
      return Array.isArray(data.stories) ? data.stories : [];
    },
    onMutate: async ({ stories, status, currentIterationId }) => {
      await panelQueries.cancelPanels({ panels: ALL_PANELS });
      const snapshot = panelQueries.snapshotPanels({ panels: ALL_PANELS });
      panelQueries.applyStoriesUpdate(
        stories.map((story) => ({
          ...story,
          status,
          iterationId:
            BACKLOG_STATUSES.has(status) &&
            story.iterationId !== null &&
            (currentIterationId === null ||
              story.iterationId !== currentIterationId)
              ? null
              : story.iterationId,
        })),
      );
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      rollbackOnError(
        error,
        context,
        "一括ステータス更新に失敗しました。再度お試しください。",
      );
    },
    onSuccess: (stories, variables) => {
      panelQueries.applyStoriesUpdate(stories);
      setError(null);
      showToast(
        "success",
        `${variables.storyIds.length}件のステータスを${STORY_STATUS_LABELS[variables.status]}に変更しました`,
      );
    },
    onSettled: () => {
      void panelQueries.invalidatePanels({
        panels: ALL_PANELS,
        refetchType: "none",
      });
    },
  });

  const bulkLabelMutation = useMutation<
    Story[],
    Error,
    BulkLabelMutationVariables,
    MutationContext
  >({
    mutationFn: async ({ storyIds, labelName }) => {
      const safeProjectId = ensureProjectId();
      const response = await fetch(
        projectBulkStoryLabelsApiPath(safeProjectId),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storyIds,
            labels: [labelName],
          }),
        },
      );
      if (!response.ok) {
        await handleErrorResponse(response);
      }
      const data = (await response.json()) as { stories: Story[] };
      return Array.isArray(data.stories) ? data.stories : [];
    },
    onMutate: async ({ stories, labelName }) => {
      await panelQueries.cancelPanels({ panels: ALL_PANELS });
      const snapshot = panelQueries.snapshotPanels({ panels: ALL_PANELS });
      panelQueries.applyStoriesUpdate(
        stories.map((story) => ({
          ...story,
          labels: story.labels.includes(labelName)
            ? story.labels
            : [...story.labels, labelName],
        })),
      );
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      rollbackOnError(
        error,
        context,
        "一括ラベル付与に失敗しました。再度お試しください。",
      );
    },
    onSuccess: (stories, variables) => {
      panelQueries.applyStoriesUpdate(stories);
      setError(null);
      showToast(
        "success",
        `${variables.storyIds.length}件にラベル「${variables.labelName}」を追加しました`,
      );
    },
    onSettled: () => {
      void panelQueries.invalidatePanels({
        panels: ALL_PANELS,
        refetchType: "none",
      });
    },
  });

  return {
    statusMutation,
    movePanelMutation,
    deleteStoryMutation,
    bulkStatusMutation,
    bulkLabelMutation,
    planStoryMoveToPanel,
  };
}
