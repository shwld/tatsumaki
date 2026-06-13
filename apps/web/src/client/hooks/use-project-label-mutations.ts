import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthError } from "../contexts/auth-error-context";
import { projectLabelsApiPath } from "../lib/story-routes";
import type {
  ProjectLabel,
  ProjectLabelResponse,
} from "../types/project-label";
import { storyQueryKeys } from "./story-query-keys";

export type CreateLabelInput = { name: string; color: string };
export type UpdateLabelInput = { name?: string; color?: string };

export function useProjectLabelMutations(projectId: string) {
  const queryClient = useQueryClient();
  const { notifySessionExpired } = useAuthError();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidateLabels = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: storyQueryKeys.projectBootstrap(projectId),
    });
  }, [queryClient, projectId]);

  const createLabel = useCallback(
    async (input: CreateLabelInput): Promise<ProjectLabel | null> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await fetch(projectLabelsApiPath(projectId), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (response.status === 401) {
          notifySessionExpired();
          return null;
        }
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? "作成に失敗しました");
          return null;
        }
        const data = (await response.json()) as ProjectLabelResponse;
        invalidateLabels();
        return data.label;
      } catch {
        setError("作成に失敗しました");
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, notifySessionExpired, invalidateLabels],
  );

  const updateLabel = useCallback(
    async (
      labelId: string,
      input: UpdateLabelInput,
    ): Promise<ProjectLabel | null> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await fetch(
          `${projectLabelsApiPath(projectId)}/${labelId}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        if (response.status === 401) {
          notifySessionExpired();
          return null;
        }
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? "更新に失敗しました");
          return null;
        }
        const data = (await response.json()) as ProjectLabelResponse;
        invalidateLabels();
        return data.label;
      } catch {
        setError("更新に失敗しました");
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, notifySessionExpired, invalidateLabels],
  );

  const deleteLabel = useCallback(
    async (labelId: string): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await fetch(
          `${projectLabelsApiPath(projectId)}/${labelId}`,
          { method: "DELETE" },
        );
        if (response.status === 401) {
          notifySessionExpired();
          return false;
        }
        if (!response.ok) {
          setError("削除に失敗しました");
          return false;
        }
        invalidateLabels();
        return true;
      } catch {
        setError("削除に失敗しました");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, notifySessionExpired, invalidateLabels],
  );

  return {
    createLabel,
    updateLabel,
    deleteLabel,
    isSubmitting,
    error,
    setError,
  };
}
