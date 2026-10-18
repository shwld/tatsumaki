import { describe, expect, it } from "vitest";
import {
  INVALID_STORY_IS_ICEBOX_ERROR,
  INVALID_STORY_LABELS_ERROR,
  INVALID_STORY_OWNER_IDS_ERROR,
  INVALID_STORY_POINT_ERROR,
  INVALID_STORY_REQUESTER_ID_ERROR,
  INVALID_STORY_STATUS_ERROR,
  INVALID_STORY_TITLE_ERROR,
  INVALID_STORY_TYPE_ERROR,
  normalizeStoryDescription,
  resolveStoryIsIcebox,
  normalizeStoryLabels,
  normalizeStoryPoint,
  normalizeStoryOwnerIds,
  normalizeStoryRequesterId,
  normalizeStoryStatus,
  normalizeStoryTitle,
  normalizeStoryType,
} from "../src/application/usecases/story-input";

describe("story input normalization", () => {
  describe("normalizeStoryDescription", () => {
    it("trims whitespace", () => {
      expect(normalizeStoryDescription("  Build login  ")).toBe("Build login");
    });

    it("allows empty string", () => {
      expect(normalizeStoryDescription("")).toBe("");
    });

    it("allows whitespace-only (trims to empty)", () => {
      expect(normalizeStoryDescription("   ")).toBe("");
    });
  });

  it("trims and validates title", () => {
    const result = normalizeStoryTitle("  Build login  ");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("Build login");
    }
  });

  it("rejects blank title", () => {
    const result = normalizeStoryTitle("   ");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_TITLE_ERROR);
    }
  });

  it("normalizes labels", () => {
    const result = normalizeStoryLabels([" backend ", "api"]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(["backend", "api"]);
    }
  });

  it("rejects blank label", () => {
    const result = normalizeStoryLabels(["ok", "  "]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_LABELS_ERROR);
    }
  });

  it("rejects unsupported type", () => {
    const result = normalizeStoryType("task");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_TYPE_ERROR);
    }
  });

  it("accepts release story type", () => {
    const result = normalizeStoryType("release");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("release");
    }
  });

  it("accepts valid story point values", () => {
    const result = normalizeStoryPoint(5);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(5);
    }
  });

  it("rejects unsupported story point when allowedPoints is specified", () => {
    const result = normalizeStoryPoint(4, [0, 1, 2, 3, 5, 8, 13]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_POINT_ERROR);
    }
  });

  it("accepts any integer story point without allowedPoints", () => {
    const result = normalizeStoryPoint(4);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(4);
    }
  });

  it("rejects unsupported story status", () => {
    const result = normalizeStoryStatus("Blocked");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_STATUS_ERROR);
    }
  });

  it("normalizes owner IDs", () => {
    const result = normalizeStoryOwnerIds([
      " github|owner ",
      "github|owner",
      "github|dev",
    ]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(["github|owner", "github|dev"]);
    }
  });

  it("rejects blank owner ID", () => {
    const result = normalizeStoryOwnerIds(["github|owner", " "]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_OWNER_IDS_ERROR);
    }
  });

  it("normalizes requester ID", () => {
    const result = normalizeStoryRequesterId(" github|requester ");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("github|requester");
    }
  });

  it("rejects blank requester ID", () => {
    const result = normalizeStoryRequesterId(" ");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_REQUESTER_ID_ERROR);
    }
  });

  // --- isIcebox domain invariant ---

  const icebox = { isIcebox: true, iterationId: null };
  const backlog = { isIcebox: false, iterationId: null };

  it("allows an explicit isIcebox=true for an unscheduled Unstarted story", () => {
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: backlog,
        nextStatus: "Unstarted",
      })._unsafeUnwrap(),
    ).toBe(true);
  });

  it.each([
    "Started",
    "Finished",
    "Delivered",
    "Rejected",
    "Accepted",
  ])("rejects an explicit isIcebox=true when the resulting status is %s", (nextStatus) => {
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: backlog,
        nextStatus,
      })._unsafeUnwrapErr(),
    ).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
  });

  it("rejects an explicit isIcebox=true for a story with an iteration", () => {
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: { isIcebox: false, iterationId: "iter-1" },
        nextStatus: "Unstarted",
      })._unsafeUnwrapErr(),
    ).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
  });

  it("allows an explicit isIcebox=false regardless of status", () => {
    expect(
      resolveStoryIsIcebox({
        requested: false,
        current: { isIcebox: true, iterationId: null },
        nextStatus: "Started",
      })._unsafeUnwrap(),
    ).toBe(false);
  });

  it.each([
    "Started",
    "Finished",
    "Delivered",
    "Rejected",
    "Accepted",
  ])("takes an Icebox story out of the Icebox when its status becomes %s", (nextStatus) => {
    expect(
      resolveStoryIsIcebox({
        requested: undefined,
        current: icebox,
        nextStatus,
      })._unsafeUnwrap(),
    ).toBe(false);
  });

  it("keeps an Icebox story in the Icebox while it stays Unstarted", () => {
    expect(
      resolveStoryIsIcebox({
        requested: undefined,
        current: icebox,
        nextStatus: "Unstarted",
      })._unsafeUnwrap(),
    ).toBeUndefined();
  });

  it("leaves a non-Icebox story untouched", () => {
    expect(
      resolveStoryIsIcebox({
        requested: undefined,
        current: backlog,
        nextStatus: "Started",
      })._unsafeUnwrap(),
    ).toBeUndefined();
  });

  it("validates creation: Unstarted Icebox is allowed, others are rejected", () => {
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: null,
        nextStatus: "Unstarted",
      })._unsafeUnwrap(),
    ).toBe(true);
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: null,
        nextStatus: "Started",
      })._unsafeUnwrapErr(),
    ).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
  });
});
