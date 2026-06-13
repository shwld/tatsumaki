import { describe, expect, it } from "vitest";

import type { Iteration } from "../types/iteration";
import { findCurrentIteration } from "./current-iteration";

function makeIteration(startDate: string, endDate: string): Iteration {
  return {
    __typename: "Iteration",
    id: `${startDate}-${endDate}`,
    projectId: "project-1",
    startDate,
    endDate,
    totalPoints: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("findCurrentIteration", () => {
  const iterations = [
    makeIteration("2026-05-04", "2026-05-11"),
    makeIteration("2026-05-11", "2026-05-18"),
  ];

  it("selects next iteration at 2026-05-11 08:35 JST", () => {
    const current = findCurrentIteration(
      iterations,
      new Date("2026-05-10T23:35:00Z"),
    );
    expect(current?.startDate).toBe("2026-05-11");
  });

  it("keeps previous iteration at 2026-05-10 23:59:59 JST", () => {
    const current = findCurrentIteration(
      iterations,
      new Date("2026-05-10T14:59:59Z"),
    );
    expect(current?.startDate).toBe("2026-05-04");
  });

  it("treats endDate as exclusive", () => {
    const current = findCurrentIteration(
      [makeIteration("2026-05-04", "2026-05-11")],
      new Date("2026-05-10T15:00:00Z"),
    );
    expect(current).toBeNull();
  });
});
