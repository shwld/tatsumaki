import type { Iteration } from "./iteration";
import type { Story } from "./story";

export type StorySection = "Done" | "Current" | "Backlog" | "Icebox";

/** Mirrors how the story panels split stories, so CLI output matches the UI. */
export function resolveStorySection(
  story: Pick<Story, "isIcebox" | "status" | "iterationId">,
  currentIterationId: string | null,
): StorySection {
  const inCurrentIteration =
    currentIterationId !== null && story.iterationId === currentIterationId;
  if (story.status === "Accepted") {
    return inCurrentIteration ? "Current" : "Done";
  }
  if (
    !story.isIcebox &&
    (story.status === "Started" ||
      story.status === "Finished" ||
      story.status === "Delivered")
  ) {
    return "Current";
  }
  if (inCurrentIteration) return "Current";
  return story.isIcebox ? "Icebox" : "Backlog";
}

export function findCurrentIterationId(
  iterations: readonly Pick<Iteration, "id" | "startDate" | "endDate">[],
  today: string,
): string | null {
  return (
    iterations.find(
      (iteration) => iteration.startDate <= today && iteration.endDate > today,
    )?.id ?? null
  );
}

const SECTION_RANK: Record<StorySection, number> = {
  Done: 0,
  Current: 1,
  Backlog: 2,
  Icebox: 3,
};

type PanelOrderKey = Pick<
  Story,
  "id" | "position" | "statusChangedAt" | "status"
> & { section: StorySection };

/** Orders stories like the UI panels, including their tie-breakers: Done (newest status change first), Current (accepted first, oldest first), Backlog, Icebox (by position). */
export function compareByPanelOrder(
  a: PanelOrderKey,
  b: PanelOrderKey,
): number {
  const byRank = SECTION_RANK[a.section] - SECTION_RANK[b.section];
  if (byRank !== 0) return byRank;
  if (a.section === "Done") {
    return (
      b.statusChangedAt.localeCompare(a.statusChangedAt) ||
      b.id.localeCompare(a.id)
    );
  }
  if (a.section === "Current") {
    const aAccepted = a.status === "Accepted";
    const bAccepted = b.status === "Accepted";
    if (aAccepted !== bAccepted) return aAccepted ? -1 : 1;
    if (aAccepted) {
      return (
        a.statusChangedAt.localeCompare(b.statusChangedAt) ||
        a.position - b.position ||
        a.id.localeCompare(b.id)
      );
    }
  }
  return a.position - b.position || a.id.localeCompare(b.id);
}
