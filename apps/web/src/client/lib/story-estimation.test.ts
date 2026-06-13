import { describe, expect, it } from "vitest";
import { shouldShowPointEstimation } from "./story-estimation";

describe("shouldShowPointEstimation", () => {
  it("returns true for feature regardless of flags", () => {
    expect(shouldShowPointEstimation("feature", false, false)).toBe(true);
    expect(shouldShowPointEstimation("feature", true, true)).toBe(true);
  });

  it("returns estimateBugs flag for bug type", () => {
    expect(shouldShowPointEstimation("bug", true, false)).toBe(true);
    expect(shouldShowPointEstimation("bug", false, false)).toBe(false);
  });

  it("returns estimateChores flag for chore type", () => {
    expect(shouldShowPointEstimation("chore", false, true)).toBe(true);
    expect(shouldShowPointEstimation("chore", false, false)).toBe(false);
  });

  it("returns estimateChores=true for chore type", () => {
    expect(shouldShowPointEstimation("chore", false, true)).toBe(true);
  });
});
