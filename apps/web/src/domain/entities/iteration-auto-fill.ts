type StoryLike = {
  id: string;
  type: "feature" | "bug" | "chore";
  storyPoint: number | null;
  position: number;
};

/**
 * Determine which stories from the Backlog should be auto-filled into Current
 * based on velocity capacity.
 *
 * PivotalTracker behavior (walk Backlog top-down by position):
 * - Estimated feature: add to Current, consume velocity capacity.
 *   When capacity is exceeded, stop adding features (greedy: the overflow story IS included).
 * - Unestimated feature: STOP. Acts as a blocker — all stories below stay in Backlog.
 * - Chore / Bug: add to Current without consuming velocity.
 *   But only if above an unestimated feature blocker.
 * - If velocity is 0, no stories are auto-filled.
 *
 * Returns the set of story IDs that belong in Current.
 */
export function autoFillCurrentStoryIds(
  backlogStories: StoryLike[],
  velocity: number,
): Set<string> {
  const currentIds = new Set<string>();

  if (velocity <= 0) {
    return currentIds;
  }

  let cumulativePoints = 0;
  let capacityExhausted = false;

  const sorted = [...backlogStories].sort((a, b) => a.position - b.position);

  for (const story of sorted) {
    if (story.type === "feature") {
      // Unestimated feature blocks further filling
      if (story.storyPoint === null) {
        break;
      }

      // Once velocity is exhausted, no more features
      if (capacityExhausted) {
        break;
      }

      currentIds.add(story.id);
      cumulativePoints += story.storyPoint;

      if (cumulativePoints >= velocity) {
        capacityExhausted = true;
      }
    } else {
      // Chore / Bug: include without consuming velocity
      // But stop if velocity is already exhausted
      if (capacityExhausted) {
        break;
      }
      currentIds.add(story.id);
    }
  }

  return currentIds;
}
