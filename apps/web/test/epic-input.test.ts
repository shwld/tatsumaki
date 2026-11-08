import { describe, expect, it } from "vitest";
import {
  INVALID_EPIC_DESCRIPTION_ERROR,
  INVALID_EPIC_OUTCOME_STATUS_ERROR,
  INVALID_EPIC_PLANNED_PERIOD_ERROR,
  normalizeEpicDescription,
  normalizeEpicOutcomeStatus,
  normalizeEpicPlannedPeriod,
} from "../src/application/usecases/epic-input";
import { hasEpicPlan } from "../src/domain/entities/epic";

describe("epic plan input", () => {
  it("accepts calendar days with start on or before end and leaves them unconverted", () => {
    expect(
      normalizeEpicPlannedPeriod({
        start: "2028-02-29",
        end: "2028-02-29",
      })._unsafeUnwrap(),
    ).toEqual({ start: "2028-02-29", end: "2028-02-29" });
    expect(normalizeEpicPlannedPeriod(null)._unsafeUnwrap()).toBeNull();
  });

  it.each([
    ["2027-02-29", "2027-03-01"],
    ["2026-11-02", "2026-11-01"],
    ["2026/11/01", "2026-11-02"],
    ["2026-13-01", "2026-13-02"],
  ])("rejects the period %s..%s", (start, end) => {
    expect(normalizeEpicPlannedPeriod({ start, end })._unsafeUnwrapErr()).toBe(
      INVALID_EPIC_PLANNED_PERIOD_ERROR,
    );
  });

  it("limits text length and outcome values", () => {
    expect(normalizeEpicDescription("x".repeat(1001))._unsafeUnwrapErr()).toBe(
      INVALID_EPIC_DESCRIPTION_ERROR,
    );
    expect(normalizeEpicOutcomeStatus("missed")._unsafeUnwrap()).toBe("missed");
    expect(normalizeEpicOutcomeStatus("done")._unsafeUnwrapErr()).toBe(
      INVALID_EPIC_OUTCOME_STATUS_ERROR,
    );
  });

  it("tells an empty plan from a saved one", () => {
    const empty = {
      description: "",
      successCriteria: "",
      ownerId: null,
      plannedStart: null,
      plannedEnd: null,
      outcomeStatus: "unevaluated" as const,
    };
    expect(hasEpicPlan(empty)).toBe(false);
    expect(hasEpicPlan({ ...empty, outcomeStatus: "achieved" })).toBe(true);
  });
});
