import { describe, expect, it } from "vitest";
import {
  formatStoryDateTime,
  getWorkflowActions,
  listSelectableStoryStatuses,
} from "./story-status";

describe("getWorkflowActions", () => {
  it("returns Start action for Unstarted feature", () => {
    const actions = getWorkflowActions("Unstarted", 3, "feature");
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe("Start");
    expect(actions[0].target).toBe("Started");
    expect(actions[0].disabled).toBe(false);
  });

  it("returns Accept and Reject for Delivered", () => {
    const actions = getWorkflowActions("Delivered", 3, "feature");
    expect(actions).toHaveLength(2);
    expect(actions[0].label).toBe("Accept");
    expect(actions[1].label).toBe("Reject");
  });

  it("returns no workflow action buttons for Accepted", () => {
    const actions = getWorkflowActions("Accepted", 3, "feature");
    expect(actions).toEqual([]);
  });

  it("disables action when estimate is required but missing", () => {
    const actions = getWorkflowActions("Unstarted", null, "feature");
    const startAction = actions.find((a) => a.target === "Started");
    expect(startAction?.disabled).toBe(true);
    expect(startAction?.disabledReason).toBe("Estimate required");
  });
});

describe("listSelectableStoryStatuses", () => {
  it("returns only the current status and allowed transitions for Unstarted", () => {
    expect(listSelectableStoryStatuses("Unstarted")).toEqual([
      "Unstarted",
      "Started",
    ]);
  });

  it("returns only the current status and allowed transitions for Accepted", () => {
    expect(listSelectableStoryStatuses("Accepted")).toEqual([
      "Unstarted",
      "Started",
      "Accepted",
    ]);
  });
});

describe("formatStoryDateTime", () => {
  it("formats ISO date string in ja-JP style", () => {
    const result = formatStoryDateTime("2024-06-15T10:30:00Z");
    expect(result).toMatch(/2024/);
  });
});
