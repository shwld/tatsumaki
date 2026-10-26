import { PANEL_TYPES, type PanelType } from "./panel-visibility";
import { planStoryMoveToPanel } from "./story-panel-transition";
import type { Story } from "../types/story";

const PANEL_TYPE_SET: ReadonlySet<string> = new Set(PANEL_TYPES);

/**
 * Resolves `drop-zone-group:<Panel>:<encodedGroupKey>` (per-sprint header in
 * {@link StoryPanel}) to a real {@link PanelType}. Combined
 * `CurrentBacklogCombined` ids are handled separately by the caller.
 */
export function panelTypeFromDropZoneGroupId(
  overIdStr: string,
): PanelType | null {
  const prefix = "drop-zone-group:";
  if (!overIdStr.startsWith(prefix)) return null;
  const rest = overIdStr.slice(prefix.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx <= 0) return null;
  const panel = rest.slice(0, colonIdx);
  return PANEL_TYPE_SET.has(panel) ? (panel as PanelType) : null;
}

export type StoryMultiPanelDropValidationContext = {
  projectId: string | undefined;
  activeStoryId: string;
  overId: string | number | null | undefined;
  findPanelByStoryId: (storyId: string) => PanelType | null;
  shouldCombineCurrentBacklog: boolean;
  combinedGroupDropZonePrefix: string;
  combinedTargetPanelByGroupKey: Map<string, PanelType>;
  allStories: Story[];
  currentIterationId: string | null;
  groupedStories: Record<PanelType, Story[]>;
  currentUnacceptedStories: Story[];
};

export type StoryMultiPanelDropDescription = {
  allowed: boolean;
  sourcePanel: PanelType | null;
  targetPanel: PanelType | null;
};

const NOT_DROPPABLE: StoryMultiPanelDropDescription = {
  allowed: false,
  sourcePanel: null,
  targetPanel: null,
};

/**
 * Mirrors drag-end target resolution in StoryMultiPanelScreen to drive cursor / hover feedback.
 */
export function isStoryMultiPanelDropAllowed(
  ctx: StoryMultiPanelDropValidationContext,
): boolean {
  return describeStoryMultiPanelDrop(ctx).allowed;
}

export function describeStoryMultiPanelDrop(
  ctx: StoryMultiPanelDropValidationContext,
): StoryMultiPanelDropDescription {
  if (!ctx.overId || !ctx.projectId) return NOT_DROPPABLE;

  const activeId = ctx.activeStoryId;
  const overIdStr = String(ctx.overId);
  const sourcePanel = ctx.findPanelByStoryId(activeId);
  if (!sourcePanel) return NOT_DROPPABLE;

  let targetPanel: PanelType | null = null;
  if (
    ctx.shouldCombineCurrentBacklog &&
    overIdStr.startsWith(ctx.combinedGroupDropZonePrefix)
  ) {
    const encodedGroupKey = overIdStr.slice(
      ctx.combinedGroupDropZonePrefix.length,
    );
    let decodedGroupKey = encodedGroupKey;
    try {
      decodedGroupKey = decodeURIComponent(encodedGroupKey);
    } catch {
      decodedGroupKey = encodedGroupKey;
    }
    targetPanel =
      ctx.combinedTargetPanelByGroupKey.get(decodedGroupKey) ?? null;
  } else if (overIdStr.startsWith("drop-zone-group:")) {
    targetPanel = panelTypeFromDropZoneGroupId(overIdStr);
  } else if (overIdStr.startsWith("drop-zone-")) {
    targetPanel = overIdStr.replace("drop-zone-", "") as PanelType;
  } else {
    targetPanel = ctx.findPanelByStoryId(overIdStr);
  }
  if (
    ctx.shouldCombineCurrentBacklog &&
    overIdStr === "drop-zone-Backlog" &&
    sourcePanel !== "Done"
  ) {
    targetPanel = sourcePanel;
  }
  if (!targetPanel) return { ...NOT_DROPPABLE, sourcePanel };
  const result = (allowed: boolean): StoryMultiPanelDropDescription => ({
    allowed,
    sourcePanel,
    targetPanel,
  });

  if (sourcePanel !== targetPanel) {
    if (targetPanel === "Done") return result(false);
    if (
      targetPanel === "Backlog" ||
      targetPanel === "Current" ||
      targetPanel === "Icebox"
    ) {
      const originalStory = ctx.allStories.find((s) => s.id === activeId);
      if (!originalStory) return result(false);
      const plan = planStoryMoveToPanel({
        story: originalStory,
        targetPanel,
        currentIterationId: ctx.currentIterationId,
      });
      return result(plan.ok);
    }
    return result(false);
  }

  const reorderTargetStories =
    sourcePanel === "Backlog"
      ? ctx.groupedStories.Backlog
      : sourcePanel === "Current"
        ? ctx.currentUnacceptedStories
        : sourcePanel === "Icebox"
          ? ctx.groupedStories.Icebox
          : null;
  return result(
    Boolean(reorderTargetStories && reorderTargetStories.length > 0),
  );
}
