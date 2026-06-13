import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthError } from "../contexts/auth-error-context";
import { useToast } from "../contexts/toast-context";
import { storyQueryKeys } from "./story-query-keys";
import { isAuthError } from "../lib/api-error";
import {
  parseErrorMessage,
  parseFieldErrors,
} from "../lib/parse-error-message";
import { projectStoriesApiPath } from "../lib/story-routes";
import type { FieldErrors } from "../types/form";
import type { Story } from "../types/story";

export type UseStoryPatchOptions = {
  onValidationError?: (parsed: {
    fieldErrors: FieldErrors;
    formError: string | null;
  }) => void;
  getOptimisticBaseStory?: () => Story | null;
};

export function useStoryPatch(
  projectId: string,
  storyNumber: string,
  onStoryUpdated?: (story: Story) => void,
  options?: UseStoryPatchOptions,
) {
  const queryClient = useQueryClient();
  const { notifySessionExpired } = useAuthError();
  const { showToast } = useToast();
  const [pendingCount, setPendingCount] = useState(0);
  const mutationSequenceRef = useRef(0);
  const latestStoryRef = useRef<Story | null>(null);

  const syncStoryUpdate = useCallback(
    (nextStory: Story) => {
      latestStoryRef.current = nextStory;
      queryClient.setQueryData(
        storyQueryKeys.storyDetail(projectId, storyNumber),
        nextStory,
      );
      onStoryUpdated?.(nextStory);
    },
    [onStoryUpdated, queryClient, projectId, storyNumber],
  );

  const patchStory = useCallback(
    async (fields: Record<string, unknown>) => {
      const requestId = ++mutationSequenceRef.current;
      const optimisticBase =
        latestStoryRef.current ??
        options?.getOptimisticBaseStory?.() ??
        queryClient.getQueryData<Story>(
          storyQueryKeys.storyDetail(projectId, storyNumber),
        ) ??
        null;
      if (optimisticBase) {
        syncStoryUpdate({
          ...optimisticBase,
          ...fields,
        } as Story);
      }
      setPendingCount((count) => count + 1);
      try {
        const response = await fetch(
          `${projectStoriesApiPath(projectId)}/${storyNumber}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(fields),
          },
        );
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        if (!response.ok) {
          if (response.status === 422 && options?.onValidationError) {
            const parsed = await parseFieldErrors(response);
            options.onValidationError(parsed);
            if (parsed.formError) {
              showToast("error", parsed.formError);
            }
            void queryClient.invalidateQueries({
              queryKey: storyQueryKeys.storyDetail(projectId, storyNumber),
            });
            void queryClient.invalidateQueries({
              queryKey: storyQueryKeys.panelStoriesRoot(projectId),
            });
            return;
          }
          const message = await parseErrorMessage(response);
          showToast(
            "error",
            `ストーリーの更新に失敗しました: ${message}. 再試行してください。`,
          );
          void queryClient.invalidateQueries({
            queryKey: storyQueryKeys.storyDetail(projectId, storyNumber),
          });
          void queryClient.invalidateQueries({
            queryKey: storyQueryKeys.panelStoriesRoot(projectId),
          });
          return;
        }
        const data = (await response.json()) as { story: Story };
        if (requestId === mutationSequenceRef.current) {
          syncStoryUpdate(data.story);
        }
      } catch {
        showToast(
          "error",
          "ストーリーの更新に失敗しました: ネットワークを確認して再試行してください。",
        );
        void queryClient.invalidateQueries({
          queryKey: storyQueryKeys.storyDetail(projectId, storyNumber),
        });
        void queryClient.invalidateQueries({
          queryKey: storyQueryKeys.panelStoriesRoot(projectId),
        });
      } finally {
        setPendingCount((count) => Math.max(0, count - 1));
      }
    },
    [
      projectId,
      storyNumber,
      syncStoryUpdate,
      notifySessionExpired,
      showToast,
      queryClient,
      options?.onValidationError,
      options?.getOptimisticBaseStory,
    ],
  );

  return { patchStory, isSaving: pendingCount > 0, syncStoryUpdate };
}
