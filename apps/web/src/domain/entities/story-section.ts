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
