import { describe, expect, it } from "vitest";
import type { Story } from "../src/domain/entities/story";
import {
  compareByPanelOrder,
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

describe("compareByPanelOrder", () => {
  const row = (
    section: "Done" | "Current" | "Backlog" | "Icebox",
    position: number,
    statusChangedAt = "",
    status: Story["status"] = "Unstarted",
  ) => ({ section, position, statusChangedAt, status });

  it("orders sections as the UI panels and Done by newest status change", () => {
    const sorted = [
      row("Icebox", 1),
      row("Backlog", 5),
      row("Done", 9, "2026-11-01 00:00:00"),
      row("Current", 9),
      row("Current", 20, "2026-11-02 00:00:00", "Accepted"),
      row("Backlog", 2),
      row("Done", 1, "2026-11-05 00:00:00"),
    ].sort(compareByPanelOrder);
    expect(sorted.map((r) => [r.section, r.position])).toEqual([
      ["Done", 1],
      ["Done", 9],
      ["Current", 20],
      ["Current", 9],
      ["Backlog", 2],
      ["Backlog", 5],
      ["Icebox", 1],
    ]);
  });
});
