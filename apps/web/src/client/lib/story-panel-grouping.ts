import type { Story, StoryStatus } from "../types/story";
import type { Iteration } from "../types/iteration";
import { PANEL_TYPES, type PanelType } from "./panel-visibility";
import { panelTypeFromDropZoneGroupId } from "./story-multi-panel-drop-allowed";

export type PanelAssignmentContext = {
  currentIterationId?: string | null;
  currentStoryIds?: Set<string> | null;
};

/** Statuses that always appear in Current (in-progress work) */
const IN_PROGRESS_STATUSES: Set<StoryStatus> = new Set([
  "Started",
  "Finished",
  "Delivered",
]);

export function determinePanelForStory(
  story: Story,
  context?: PanelAssignmentContext,
): PanelType {
  const ctx = context ?? {};

  if (
    story.status === "Accepted" &&
    ctx.currentIterationId &&
    story.iterationId === ctx.currentIterationId
  ) {
    return "Current";
  }

  if (story.status === "Accepted") return "Done";

  // In-progress stories (Started/Finished/Delivered) always go to Current
  // (PivotalTracker convention: active work is always in the current iteration)
  if (IN_PROGRESS_STATUSES.has(story.status) && !story.isIcebox)
    return "Current";

  // Auto-fill: if story is in the computed current set, show in Current
  if (ctx.currentStoryIds?.has(story.id)) return "Current";

  // Manual assignment: if story has matching iterationId, show in Current
  if (ctx.currentIterationId && story.iterationId === ctx.currentIterationId)
    return "Current";

  if (story.isIcebox) return "Icebox";
  return "Backlog";
}

export function groupStoriesByPanel(
  stories: Story[],
  context?: PanelAssignmentContext,
): Record<PanelType, Story[]> {
  const groups: Record<PanelType, Story[]> = {
    Done: [],
    Current: [],
    Backlog: [],
    Icebox: [],
  };

  for (const story of stories) {
    groups[determinePanelForStory(story, context)].push(story);
  }

  return groups;
}

export function resolveDropTargetPanel(
  overId: string,
  stories: Story[],
  context?: PanelAssignmentContext,
): PanelType | null {
  const fromGroupHeader = panelTypeFromDropZoneGroupId(overId);
  if (fromGroupHeader) return fromGroupHeader;
  if (overId.startsWith("drop-zone-")) {
    const panel = overId.replace("drop-zone-", "");
    if ((PANEL_TYPES as readonly string[]).includes(panel))
      return panel as PanelType;
    return null;
  }
  const overStory = stories.find((s) => s.id === overId);
  if (overStory) return determinePanelForStory(overStory, context);
  return null;
}

export function calculateTotalPoints(stories: Story[]): number {
  return stories.reduce((sum, story) => sum + (story.storyPoint ?? 0), 0);
}

export type IterationGroup = {
  key: string;
  iterationId: string | null;
  iterationNumber: number | null;
  startDate: string | null;
  endDate: string | null;
  label: string;
  groupType: "iteration" | "future-iteration";
  stories: Story[];
  totalPoints: number;
  effectiveSprintUtilizationPercent: number;
};

type GroupStoriesByIterationOptions = {
  panelType?: PanelType;
  velocity?: number | null;
  currentTotalPoints?: number | null;
  sprintDurationDays?: number | null;
  iterationStartDay?: number | null;
  currentIterationEndDate?: string | null;
  currentIterationNumber?: number | null;
  utilizationOverrideByIterationNumber?: Record<number, number>;
  todayIso?: string;
};

function resolveIterationCapacity(
  velocity: number,
  utilizationPercent?: number,
): number {
  const utilization =
    typeof utilizationPercent === "number" && utilizationPercent >= 0
      ? Math.min(utilizationPercent, 100)
      : 100;
  return Math.floor((velocity * utilization) / 100);
}

function isFutureIterationGroupingEnabled(panelType?: PanelType): boolean {
  return panelType === "Current" || panelType === "Backlog";
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareIterationGroups(a: IterationGroup, b: IterationGroup): number {
  if (a.startDate === null && b.startDate === null) return 0;
  if (a.startDate === null) return 1;
  if (b.startDate === null) return -1;
  return a.startDate.localeCompare(b.startDate);
}

function resolveFutureIterationAnchorDate(
  iterations: Iteration[],
  opts: GroupStoriesByIterationOptions,
): string {
  if (opts.currentIterationEndDate) {
    return addDays(opts.currentIterationEndDate, 1);
  }

  const todayIso = opts.todayIso ?? new Date().toISOString().slice(0, 10);
  const currentIteration = iterations.find(
    (iteration) =>
      iteration.startDate <= todayIso && iteration.endDate > todayIso,
  );

  if (currentIteration) {
    return addDays(currentIteration.endDate, 1);
  }

  const sprintDurationDays =
    typeof opts.sprintDurationDays === "number" && opts.sprintDurationDays > 0
      ? opts.sprintDurationDays
      : 14;
  const iterationStartDay =
    typeof opts.iterationStartDay === "number" &&
    opts.iterationStartDay >= 0 &&
    opts.iterationStartDay <= 6
      ? opts.iterationStartDay
      : 1;

  const todayDate = new Date(`${todayIso}T00:00:00Z`);
  const todayDow = todayDate.getUTCDay();
  const daysBack = (todayDow - iterationStartDay + 7) % 7;
  todayDate.setUTCDate(todayDate.getUTCDate() - daysBack);
  const currentIterationStart = todayDate.toISOString().slice(0, 10);
  return addDays(currentIterationStart, sprintDurationDays);
}

export function groupStoriesByIteration(
  stories: Story[],
  iterations: Iteration[],
  options?: GroupStoriesByIterationOptions,
): IterationGroup[] {
  const opts = options ?? {};
  const iterationById = new Map(
    iterations.map((iteration) => [iteration.id, iteration]),
  );
  const groups = new Map<string, IterationGroup>();
  const unassignedStories: Story[] = [];
  const sprintDurationDays =
    typeof opts.sprintDurationDays === "number" && opts.sprintDurationDays > 0
      ? opts.sprintDurationDays
      : 14;

  for (const story of stories) {
    const useFutureIteration =
      isFutureIterationGroupingEnabled(opts.panelType) &&
      story.iterationId === null;
    if (useFutureIteration) {
      unassignedStories.push(story);
      continue;
    }

    const matchedIteration = story.iterationId
      ? (iterationById.get(story.iterationId) ?? null)
      : null;
    const key = `iteration-${story.iterationId ?? "unassigned"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.stories.push(story);
      existing.totalPoints += story.storyPoint ?? 0;
      continue;
    }
    const iterationNumber = matchedIteration?.iterationNumber ?? null;
    groups.set(key, {
      key,
      iterationId: story.iterationId,
      iterationNumber,
      startDate: matchedIteration?.startDate ?? null,
      endDate: matchedIteration?.endDate ?? null,
      label: matchedIteration?.startDate
        ? `開始: ${matchedIteration.startDate}`
        : "開始日未設定",
      groupType: "iteration",
      stories: [story],
      totalPoints: story.storyPoint ?? 0,
      effectiveSprintUtilizationPercent:
        matchedIteration?.effectiveSprintUtilizationPercent ?? 100,
    });
  }

  if (unassignedStories.length > 0) {
    const sortedUnassigned = [...unassignedStories].sort(
      (a, b) => a.position - b.position,
    );
    const futureStartDate = resolveFutureIterationAnchorDate(iterations, opts);
    const velocity =
      typeof opts.velocity === "number" && opts.velocity > 0
        ? opts.velocity
        : 0;
    const todayIso = opts.todayIso ?? new Date().toISOString().slice(0, 10);
    const currentIteration =
      iterations.find(
        (iteration) =>
          iteration.startDate <= todayIso && iteration.endDate > todayIso,
      ) ?? null;
    const currentIterationNumber =
      opts.currentIterationNumber ?? currentIteration?.iterationNumber ?? null;
    const overrideByNumber = opts.utilizationOverrideByIterationNumber ?? {};
    const currentIterationCapacity = currentIteration
      ? resolveIterationCapacity(
          velocity,
          currentIteration.effectiveSprintUtilizationPercent,
        )
      : velocity;
    const capacityByIterationNumber = new Map<number, number>();
    for (const iteration of iterations) {
      if (typeof iteration.iterationNumber !== "number") continue;
      const overridePercent = overrideByNumber[iteration.iterationNumber];
      const effectivePercent =
        typeof overridePercent === "number"
          ? overridePercent
          : iteration.effectiveSprintUtilizationPercent;
      capacityByIterationNumber.set(
        iteration.iterationNumber,
        resolveIterationCapacity(velocity, effectivePercent),
      );
    }
    const firstBucketCapacity =
      opts.panelType === "Backlog" &&
      typeof opts.currentTotalPoints === "number" &&
      currentIterationCapacity > 0
        ? Math.max(currentIterationCapacity - opts.currentTotalPoints, 0)
        : velocity;

    const capacities: number[] =
      velocity > 0 ? [firstBucketCapacity] : [Number.POSITIVE_INFINITY];
    const consumed: number[] = [0];
    const groupedStories: Story[][] = [[]];

    for (const story of sortedUnassigned) {
      const points = story.storyPoint ?? 0;
      let targetIdx = -1;
      for (let idx = 0; idx < groupedStories.length; idx += 1) {
        const canFit =
          points === 0
            ? consumed[idx]! < capacities[idx]!
            : consumed[idx]! + points <= capacities[idx]!;
        if (canFit) {
          targetIdx = idx;
          break;
        }
      }
      if (targetIdx === -1) {
        targetIdx = groupedStories.length;
        groupedStories.push([]);
        consumed.push(0);
        const iterationNumber =
          currentIterationNumber !== null
            ? currentIterationNumber + targetIdx + 1
            : null;
        const nextCapacity =
          iterationNumber !== null
            ? (capacityByIterationNumber.get(iterationNumber) ??
              resolveIterationCapacity(
                velocity,
                overrideByNumber[iterationNumber] ?? 100,
              ))
            : velocity;
        capacities.push(velocity > 0 ? nextCapacity : Number.POSITIVE_INFINITY);
      }

      groupedStories[targetIdx]!.push(story);
      consumed[targetIdx]! += points;
    }

    groupedStories.forEach((bucketStories, idx) => {
      if (bucketStories.length === 0) return;
      const startDate = addDays(futureStartDate, sprintDurationDays * idx);
      const endDate = addDays(startDate, sprintDurationDays);
      const iterationNumber =
        currentIterationNumber !== null
          ? currentIterationNumber + idx + 1
          : null;
      const overridePercent =
        iterationNumber !== null
          ? overrideByNumber[iterationNumber]
          : undefined;
      groups.set(`future-iteration-${startDate}`, {
        key: `future-iteration-${startDate}`,
        iterationId: null,
        iterationNumber,
        startDate,
        endDate,
        label: `開始: ${startDate}`,
        groupType: "future-iteration",
        stories: bucketStories,
        totalPoints: bucketStories.reduce(
          (sum, item) => sum + (item.storyPoint ?? 0),
          0,
        ),
        effectiveSprintUtilizationPercent: overridePercent ?? 100,
      });
    });
  }

  return Array.from(groups.values()).sort(compareIterationGroups);
}
