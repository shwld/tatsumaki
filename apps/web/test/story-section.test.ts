import { describe, expect, it } from "vitest";
import {
  findCurrentIterationId,
  resolveStorySection,
} from "../src/domain/entities/story-section";

const story = (status: string, iterationId: string | null, isIcebox = false) =>
  ({ status, iterationId, isIcebox }) as Parameters<
    typeof resolveStorySection
  >[0];

describe("resolveStorySection", () => {
  it("keeps in-progress stories in Current whatever iteration they are assigned to", () => {
    expect(resolveStorySection(story("Started", null), "it1")).toBe("Current");
    expect(resolveStorySection(story("Delivered", "it0"), "it1")).toBe(
      "Current",
    );
  });

  it("splits Accepted stories by the current iteration", () => {
    expect(resolveStorySection(story("Accepted", "it1"), "it1")).toBe(
      "Current",
    );
    expect(resolveStorySection(story("Accepted", "it0"), "it1")).toBe("Done");
  });

  it("puts Unstarted stories in Current only when assigned to the current iteration", () => {
    expect(resolveStorySection(story("Unstarted", "it1"), "it1")).toBe(
      "Current",
    );
    expect(resolveStorySection(story("Unstarted", "it2"), "it1")).toBe(
      "Backlog",
    );
    expect(resolveStorySection(story("Unstarted", null), null)).toBe("Backlog");
    expect(resolveStorySection(story("Unstarted", null, true), "it1")).toBe(
      "Icebox",
    );
  });
});

describe("findCurrentIterationId", () => {
  it("picks the iteration that contains today", () => {
    const iterations = [
      { id: "a", startDate: "2026-11-01", endDate: "2026-11-08" },
      { id: "b", startDate: "2026-11-08", endDate: "2026-11-15" },
    ];
    expect(findCurrentIterationId(iterations, "2026-11-08")).toBe("b");
    expect(findCurrentIterationId(iterations, "2026-12-01")).toBeNull();
  });
});
