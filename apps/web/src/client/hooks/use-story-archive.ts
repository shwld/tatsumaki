import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { parseErrorMessage } from "../lib/parse-error-message";
import { projectStoriesApiPath } from "../lib/story-routes";
import type { Story } from "../types/story";
import { storyQueryKeys } from "./story-query-keys";

export function useStoryArchive(
  story: Pick<Story, "projectId" | "storyNumber">,
  onStoryUpdated?: (story: Story) => void,
) {
  const queryClient = useQueryClient();
  const { projectId, storyNumber } = story;

  return useCallback(
    async (archived: boolean) => {
      const response = await fetch(
        `${projectStoriesApiPath(projectId)}/${storyNumber}/${archived ? "archive" : "unarchive"}`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const result = (await response.json()) as { story: Story };
      onStoryUpdated?.(result.story);
      const storyRef = String(storyNumber);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: storyQueryKeys.panelStoriesRoot(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: storyQueryKeys.storyDetail(projectId, storyRef),
        }),
        queryClient.invalidateQueries({
          queryKey: storyQueryKeys.storyTimeline(projectId, storyRef),
        }),
        queryClient.invalidateQueries({
          queryKey: storyQueryKeys.projectHistory(projectId),
        }),
      ]);
    },
    [projectId, storyNumber, onStoryUpdated, queryClient],
  );
}
