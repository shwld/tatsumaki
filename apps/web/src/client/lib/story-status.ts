import {
  listAllowedStoryStatusTransitions as listAllowedStoryStatusTransitionsInDomain,
  requiresEstimateForTransition,
} from "../../domain/entities/story";
import {
  STORY_STATUSES,
  type StoryStatus,
  type StoryType,
} from "../types/story";

export const STORY_STATUS_LABELS: Record<StoryStatus, string> = {
  Unstarted: "未着手",
  Started: "着手中",
  Finished: "完了",
  Delivered: "デリバリー済み",
  Accepted: "受け入れ済み",
  Rejected: "リジェクト",
};

/**
 * Map from current status to the workflow action button(s) to display.
 * PivotalTracker convention: primary forward action + optional reject/restart.
 */
const STORY_STATUS_ACTIONS: Record<
  StoryStatus,
  {
    label: string;
    target: StoryStatus;
    variant: "primary" | "danger" | "secondary";
  }[]
> = {
  Unstarted: [{ label: "Start", target: "Started", variant: "primary" }],
  Started: [{ label: "Finish", target: "Finished", variant: "primary" }],
  Finished: [{ label: "Deliver", target: "Delivered", variant: "primary" }],
  Delivered: [
    { label: "Accept", target: "Accepted", variant: "primary" },
    { label: "Reject", target: "Rejected", variant: "danger" },
  ],
  Accepted: [],
  Rejected: [{ label: "Restart", target: "Started", variant: "secondary" }],
};

type WorkflowAction = {
  label: string;
  target: StoryStatus;
  variant: "primary" | "danger" | "secondary";
  disabled: boolean;
  disabledReason: string | null;
};

export function getWorkflowActions(
  status: StoryStatus,
  storyPoint: number | null,
  storyType: StoryType,
): WorkflowAction[] {
  const actions = STORY_STATUS_ACTIONS[status];
  return actions.map((action) => {
    const needsEstimate = requiresEstimateForTransition(
      action.target,
      storyPoint,
      storyType,
    );
    return {
      ...action,
      disabled: needsEstimate,
      disabledReason: needsEstimate ? "見積もりが必要です" : null,
    };
  });
}

export function listAllowedStoryStatusTransitions(
  status: StoryStatus,
): StoryStatus[] {
  return listAllowedStoryStatusTransitionsInDomain(status);
}

export function listSelectableStoryStatuses(
  _status: StoryStatus,
): StoryStatus[] {
  return [...STORY_STATUSES];
}

export function formatStoryStatusChangedAt(value: string): string {
  return formatStoryDateTime(value);
}

export function formatStoryDateTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
