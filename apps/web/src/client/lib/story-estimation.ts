import type { StoryType } from "../types/story";

export function shouldShowPointEstimation(
  type: StoryType,
  estimateBugs: boolean,
  estimateChores: boolean,
): boolean {
  if (type === "feature") return true;
  if (type === "bug") return estimateBugs;
  if (type === "chore") return estimateChores;
  return true;
}
