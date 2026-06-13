import { listAllowedStoryStatusTransitions } from "./story-status";
import type { PanelType } from "./panel-visibility";
import type { Story, StoryStatus } from "../types/story";

const CURRENT_PANEL_STATUSES: Set<StoryStatus> = new Set([
  "Unstarted",
  "Rejected",
  "Started",
  "Finished",
  "Delivered",
]);

type PanelMovePlanSuccess = {
  ok: true;
  statusPath: StoryStatus[];
  targetStatus: StoryStatus;
  targetIterationId: string | null;
  targetIsIcebox: boolean;
};

type PanelMovePlanFailure = {
  ok: false;
  error: string;
};

export type PanelMovePlan = PanelMovePlanSuccess | PanelMovePlanFailure;

function findStatusPath(
  from: StoryStatus,
  to: StoryStatus,
): StoryStatus[] | null {
  if (from === to) return [];

  const queue: Array<{ status: StoryStatus; path: StoryStatus[] }> = [
    { status: from, path: [] },
  ];
  const visited = new Set<StoryStatus>([from]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    for (const next of listAllowedStoryStatusTransitions(current.status)) {
      if (visited.has(next)) continue;
      const nextPath = [...current.path, next];
      if (next === to) {
        return nextPath;
      }
      visited.add(next);
      queue.push({ status: next, path: nextPath });
    }
  }

  return null;
}

export function planStoryMoveToPanel(params: {
  story: Story;
  targetPanel: PanelType;
  currentIterationId: string | null;
}): PanelMovePlan {
  const { story, targetPanel, currentIterationId } = params;

  if (targetPanel === "Done") {
    return { ok: false, error: "Done panel への移動はサポートしていません。" };
  }

  if (story.status === "Accepted") {
    return {
      ok: false,
      error: "Accepted のストーリーは Done 以外へ移動できません。",
    };
  }

  let targetStatus: StoryStatus;
  let targetIterationId: string | null;
  let targetIsIcebox: boolean;

  if (targetPanel === "Current") {
    if (!currentIterationId) {
      return {
        ok: false,
        error:
          "現在のイテレーションが見つからないため、Current へ移動できません。",
      };
    }
    targetStatus = CURRENT_PANEL_STATUSES.has(story.status)
      ? story.status
      : "Started";
    targetIterationId = currentIterationId;
    targetIsIcebox = false;
  } else if (targetPanel === "Backlog") {
    targetStatus = "Unstarted";
    targetIterationId = null;
    targetIsIcebox = false;
  } else {
    targetStatus = "Unstarted";
    targetIterationId = null;
    targetIsIcebox = true;
  }

  const statusPath = findStatusPath(story.status, targetStatus);
  if (!statusPath) {
    return {
      ok: false,
      error: `ステータスを ${story.status} から ${targetStatus} に変更できません。`,
    };
  }

  return {
    ok: true,
    statusPath,
    targetStatus,
    targetIterationId,
    targetIsIcebox,
  };
}
