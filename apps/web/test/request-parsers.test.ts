import { describe, expect, it } from "vitest";
import {
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
        labels: [],
        epicId: null,
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
        labels: [],
        epicId: null,
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
        labels: [],
        epicId: null,
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

  it("returns error for invalid create labels", () => {
    const result = parseCreateStoryRequest({
      title: "New story",
      description: "Implement feature",
      labels: ["ok", 1],
    });

    expect(result).toEqual({
      ok: false,
      message: "Story labels must be an array of strings",
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
        labels: [],
        epicId: null,
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

  it("parses partial update request", () => {
    const result = parseUpdateStoryRequest({
      title: "Updated",
      labels: ["backend"],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        title: "Updated",
        labels: ["backend"],
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
      labels: ["backend", "priority:high"],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        storyIds: ["story-1"],
        labels: ["backend", "priority:high"],
      },
    });
  });

  it("returns error for invalid bulk labels request", () => {
    const result = parseBulkAddStoryLabelsRequest({
      storyIds: ["story-1"],
      labels: [],
    });

    expect(result).toEqual({
      ok: false,
      message: "labels must be a non-empty string array",
    });
  });
});
