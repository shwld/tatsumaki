import { describe, expect, it } from "vitest";
import {
  idealRemainingForDay,
  listIterationUtcDatesHalfOpen,
} from "../../src/application/usecases/burndown-chart";

describe("burndown-chart math", () => {
  it("lists dates with half-open end boundary", () => {
    expect(listIterationUtcDatesHalfOpen("2026-04-01", "2026-04-05")).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
    ]);
  });

  it("interpolates ideal remaining between start (exclusive-end) sprint bounds", () => {
    expect(
      idealRemainingForDay(100, "2026-04-01", "2026-04-06", "2026-04-01"),
    ).toBe(100);
    expect(
      idealRemainingForDay(100, "2026-04-01", "2026-04-06", "2026-04-06"),
    ).toBe(0);

    expect(
      idealRemainingForDay(100, "2026-04-01", "2026-04-06", "2026-04-04"),
    ).toBe(40);
  });

  it("updates ideal remaining when scope changes mid-iteration", () => {
    expect(
      idealRemainingForDay(10, "2026-04-01", "2026-04-06", "2026-04-03"),
    ).toBe(6);
    expect(
      idealRemainingForDay(20, "2026-04-01", "2026-04-06", "2026-04-03"),
    ).toBe(12);
  });
});
