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
  normalizeStoryIsIcebox,
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

  it("allows isIcebox=true when no iterationId and not Accepted", () => {
    const result = normalizeStoryIsIcebox(true, {
      iterationId: null,
      status: "Unstarted",
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(true);
  });

  it("allows isIcebox=false regardless of context", () => {
    const result = normalizeStoryIsIcebox(false, {
      iterationId: "iter-1",
      status: "Accepted",
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(false);
  });

  it("rejects isIcebox=true when story has iterationId", () => {
    const result = normalizeStoryIsIcebox(true, {
      iterationId: "iter-1",
      status: "Unstarted",
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
    }
  });

  it("rejects isIcebox=true when story is Accepted", () => {
    const result = normalizeStoryIsIcebox(true, {
      iterationId: null,
      status: "Accepted",
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
    }
  });

  it("allows isIcebox=true without context (backward compat)", () => {
    const result = normalizeStoryIsIcebox(true);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(true);
  });
});
