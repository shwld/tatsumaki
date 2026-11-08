import { describe, expect, it } from "vitest";
import {
  LABEL_NAMES_WRITE_REMOVED_MESSAGE,
  parseBulkAddStoryLabelsRequest,
  parseBulkUpdateStoryStatusRequest,
  parseCreateStoryRequest,
  parseReorderStoriesRequest,
  parseStoryBlockerRequest,
  parseUpdateStoryRequest,
} from "../src/presentation/routes/stories/request-parsers";

describe("story request parsers", () => {
  it("parses create request with defaults", () => {
    const result = parseCreateStoryRequest({
      title: "New story",
      description: "Implement feature",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        title: "New story",
        description: "Implement feature",
        panel: "backlog",
        type: "feature",
        status: "Unstarted",
        storyPoint: null,
        labelIds: [],
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: undefined,
      },
    });
  });

  it("parses create request without description (defaults to empty string)", () => {
    const result = parseCreateStoryRequest({ title: "New story" });

    expect(result).toEqual({
      ok: true,
      value: {
        title: "New story",
        description: "",
        panel: "backlog",
        type: "feature",
        status: "Unstarted",
        storyPoint: null,
        labelIds: [],
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: undefined,
      },
    });
  });

  it("returns error when description is not a string", () => {
    const result = parseCreateStoryRequest({
      title: "New story",
      description: 1,
    });

    expect(result).toEqual({
      ok: false,
      message: "Story description must be a string",
    });
  });

  it("parses story point and status fields", () => {
    const createResult = parseCreateStoryRequest({
      title: "New story",
      description: "Implement feature",
      status: "Started",
      storyPoint: 3,
    });
    const updateResult = parseUpdateStoryRequest({
      status: "Finished",
      storyPoint: null,
    });

    expect(createResult).toEqual({
      ok: true,
      value: {
        title: "New story",
        description: "Implement feature",
        panel: "backlog",
        type: "feature",
        status: "Started",
        storyPoint: 3,
        labelIds: [],
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: undefined,
      },
    });
    expect(updateResult).toEqual({
      ok: true,
      value: {
        status: "Finished",
        storyPoint: null,
      },
    });
  });

  it("rejects label names on create", () => {
    const result = parseCreateStoryRequest({
      title: "New story",
      description: "Implement feature",
      labels: ["ok"],
    });

    expect(result).toEqual({
      ok: false,
      message: LABEL_NAMES_WRITE_REMOVED_MESSAGE,
    });
  });

  it("rejects label names on update", () => {
    expect(parseUpdateStoryRequest({ labels: ["backend"] })).toEqual({
      ok: false,
      message: LABEL_NAMES_WRITE_REMOVED_MESSAGE,
    });
  });

  it("prefers panel over isIcebox in create request", () => {
    const result = parseCreateStoryRequest({
      title: "New story",
      description: "Implement feature",
      panel: "icebox",
      isIcebox: false,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        title: "New story",
        description: "Implement feature",
        panel: "icebox",
        type: "feature",
        status: "Unstarted",
        storyPoint: null,
        labelIds: [],
        isIcebox: true,
        ownerIds: [],
        requesterId: null,
        releaseDate: undefined,
      },
    });
  });

  it("returns error for invalid panel value", () => {
    const result = parseCreateStoryRequest({
      title: "New story",
      description: "Implement feature",
      panel: "done",
    });

    expect(result).toEqual({
      ok: false,
      message: "panel must be one of icebox, backlog, or current",
    });
  });

  it("rejects epicId and points to label membership", () => {
    for (const result of [
      parseCreateStoryRequest({ title: "Story", epicId: null }),
      parseUpdateStoryRequest({ epicId: "epic-1" }),
    ]) {
      expect(result).toEqual({
        ok: false,
        message: expect.stringContaining("addLabelIds"),
      });
    }
  });

  it("parses partial update request", () => {
    const result = parseUpdateStoryRequest({
      title: "Updated",
      addLabelIds: ["label-1"],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        title: "Updated",
        addLabelIds: ["label-1"],
      },
    });
  });

  it("returns error for invalid update type", () => {
    const result = parseUpdateStoryRequest({
      type: 1,
    });

    expect(result).toEqual({
      ok: false,
      message: "Story type must be a string",
    });
  });

  it("returns error for invalid story point", () => {
    const result = parseUpdateStoryRequest({
      storyPoint: "3",
    });

    expect(result).toEqual({
      ok: false,
      message: "Story point must be a number or null",
    });
  });

  it("returns error for invalid status", () => {
    const result = parseUpdateStoryRequest({
      status: 1,
    });

    expect(result).toEqual({
      ok: false,
      message: "Story status must be a string",
    });
  });

  it("parses reorder request", () => {
    const result = parseReorderStoriesRequest({
      orderedIds: ["a", "b"],
    });

    expect(result).toEqual({
      ok: true,
      value: { orderedIds: ["a", "b"] },
    });
  });

  it("returns error for invalid reorder request", () => {
    const result = parseReorderStoriesRequest({ orderedIds: ["a", 1] });

    expect(result).toEqual({
      ok: false,
      message: "orderedIds must be an array of story IDs",
    });
  });

  it("parses story blocker request", () => {
    const result = parseStoryBlockerRequest({
      relation: "blockedBy",
      targetStoryId: "story-2",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        relation: "blockedBy",
        targetStoryId: "story-2",
      },
    });
  });

  it("returns error for invalid story blocker request", () => {
    const result = parseStoryBlockerRequest({
      relation: "unknown",
      targetStoryId: "",
    });

    expect(result).toEqual({
      ok: false,
      message: "relation must be blockedBy or blocks",
    });
  });

  it("parses bulk status update request", () => {
    const result = parseBulkUpdateStoryStatusRequest({
      storyIds: ["story-1", "story-2"],
      status: "Started",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        storyIds: ["story-1", "story-2"],
        status: "Started",
      },
    });
  });

  it("returns error for invalid bulk status request", () => {
    const result = parseBulkUpdateStoryStatusRequest({
      storyIds: [],
      status: 1,
    });

    expect(result).toEqual({
      ok: false,
      message: "storyIds must be a non-empty string array",
    });
  });

  it("parses bulk add labels request", () => {
    const result = parseBulkAddStoryLabelsRequest({
      storyIds: ["story-1"],
      labelIds: ["label-1", "label-2"],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        storyIds: ["story-1"],
        labelIds: ["label-1", "label-2"],
      },
    });
  });

  it("returns error for invalid bulk labels request", () => {
    const result = parseBulkAddStoryLabelsRequest({
      storyIds: ["story-1"],
      labelIds: [],
    });

    expect(result).toEqual({
      ok: false,
      message: "labelIds must be a non-empty string array",
    });
  });

  it("rejects label names on bulk add", () => {
    expect(
      parseBulkAddStoryLabelsRequest({ storyIds: ["story-1"], labels: ["a"] }),
    ).toEqual({ ok: false, message: LABEL_NAMES_WRITE_REMOVED_MESSAGE });
  });
});
