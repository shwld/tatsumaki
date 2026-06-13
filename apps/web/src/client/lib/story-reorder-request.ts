import { isAuthError } from "./api-error";
import { parseErrorMessage } from "./parse-error-message";
import { projectStoriesApiPath } from "./story-routes";
import type { PanelType } from "./panel-visibility";
import type { StoriesResponse, Story } from "../types/story";

type PersistStoryReorderInput = {
  projectId: string;
  sourcePanel: PanelType;
  optimisticReordered: Story[];
  rollbackStories: Story[];
  isLatestRequest: () => boolean;
  replacePanelStories: (panel: PanelType, stories: Story[]) => void;
  applyExistingStoriesInPanel: (panel: PanelType, stories: Story[]) => void;
  invalidatePanel: (panel: PanelType) => Promise<void> | void;
  setError: (message: string) => void;
  notifySessionExpired: () => void;
  showSuccessToast: () => void;
  showErrorToast: () => void;
  fetchImpl?: typeof fetch;
};

export async function persistStoryReorder({
  projectId,
  sourcePanel,
  optimisticReordered,
  rollbackStories,
  isLatestRequest,
  replacePanelStories,
  applyExistingStoriesInPanel,
  invalidatePanel,
  setError,
  notifySessionExpired,
  showSuccessToast,
  showErrorToast,
  fetchImpl = fetch,
}: PersistStoryReorderInput): Promise<void> {
  try {
    const response = await fetchImpl(
      `${projectStoriesApiPath(projectId)}/reorder`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderedIds: optimisticReordered.map((story) => story.id),
        }),
      },
    );

    if (!isLatestRequest()) {
      return;
    }

    if (!response.ok) {
      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }
      replacePanelStories(sourcePanel, rollbackStories);
      setError(await parseErrorMessage(response));
      return;
    }

    const data = (await response.json()) as StoriesResponse;
    if (!isLatestRequest()) {
      return;
    }
    if (Array.isArray(data.stories)) {
      // Reorder response can include off-screen stories; only sync already visible rows.
      applyExistingStoriesInPanel(sourcePanel, data.stories);
    }
    showSuccessToast();
    await invalidatePanel(sourcePanel);
  } catch {
    if (!isLatestRequest()) {
      return;
    }
    replacePanelStories(sourcePanel, rollbackStories);
    showErrorToast();
  }
}
