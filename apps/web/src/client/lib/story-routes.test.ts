import { describe, expect, it } from "vitest";
import {
  projectApiPath,
  projectDeleteApiPath,
  projectBulkStoryLabelsApiPath,
  projectBulkStoryStatusApiPath,
  projectIterationStoriesApiPath,
  projectIterationStoryApiPath,
  projectIterationsApiPath,
  projectLabelsApiPath,
  projectPointScaleApiPath,
  projectSettingsPath,
  projectStoriesApiPath,
  projectStoriesPath,
  projectStoryAttachmentContentApiPath,
  projectStoryAttachmentsApiPath,
  projectStoryBlockersApiPath,
  projectStoryCommentApiPath,
  projectStoryCommentsApiPath,
  projectStoryDetailPath,
  projectStoryEditPath,
  projectStoryHashPath,
  projectStoryPriorityHistoryApiPath,
  projectStoryTimelineApiPath,
  projectVelocityDashboardPath,
  parseStoryNumber,
  parseStoryNumberFromHash,
} from "./story-routes";

describe("story-routes", () => {
  it("projectStoriesPath", () => {
    expect(projectStoriesPath("p1")).toBe("/projects/p1/stories");
  });

  it("projectVelocityDashboardPath", () => {
    expect(projectVelocityDashboardPath("p1")).toBe("/projects/p1/velocity");
  });

  it("projectStoryEditPath", () => {
    expect(projectStoryEditPath("p1", "s1")).toBe(
      "/projects/p1/stories/s1/edit",
    );
  });

  it("projectStoryDetailPath", () => {
    expect(projectStoryDetailPath("p1", "123")).toBe(
      "/projects/p1/stories/123",
    );
  });

  it("projectStoryHashPath", () => {
    expect(projectStoryHashPath("p1", 123)).toBe("/projects/p1/stories#123");
  });

  it("parseStoryNumberFromHash", () => {
    expect(parseStoryNumberFromHash("#123")).toBe("123");
    expect(parseStoryNumberFromHash("123")).toBe("123");
    expect(parseStoryNumberFromHash("#abc")).toBeNull();
    expect(parseStoryNumberFromHash("#12a")).toBeNull();
  });

  it("parseStoryNumber", () => {
    expect(parseStoryNumber("123")).toBe("123");
    expect(parseStoryNumber(" 123 ")).toBe("123");
    expect(parseStoryNumber("abc")).toBeNull();
  });

  it("projectStoriesApiPath", () => {
    expect(projectStoriesApiPath("p1")).toBe("/api/projects/p1/stories");
    expect(
      projectStoriesApiPath("p1", {
        detail: "summary",
        limit: 200,
        order: "positionAsc",
        q: "login",
      }),
    ).toBe(
      "/api/projects/p1/stories?detail=summary&limit=200&order=positionAsc&q=login",
    );
  });

  it("projectStoryPriorityHistoryApiPath", () => {
    expect(projectStoryPriorityHistoryApiPath("p1")).toBe(
      "/api/projects/p1/stories/priority-history",
    );
  });

  it("projectBulkStoryStatusApiPath", () => {
    expect(projectBulkStoryStatusApiPath("p1")).toBe(
      "/api/projects/p1/stories/bulk-status",
    );
  });

  it("projectBulkStoryLabelsApiPath", () => {
    expect(projectBulkStoryLabelsApiPath("p1")).toBe(
      "/api/projects/p1/stories/bulk-labels",
    );
  });

  it("projectStoryTimelineApiPath", () => {
    expect(projectStoryTimelineApiPath("p1", "s1")).toBe(
      "/api/projects/p1/stories/s1/timeline",
    );
    expect(
      projectStoryTimelineApiPath("p1", "s1", { limit: 20, before: "abc" }),
    ).toBe("/api/projects/p1/stories/s1/timeline?limit=20&before=abc");
  });

  it("projectStoryBlockersApiPath", () => {
    expect(projectStoryBlockersApiPath("p1", "s1")).toBe(
      "/api/projects/p1/stories/s1/blockers",
    );
  });

  it("projectStoryCommentsApiPath", () => {
    expect(projectStoryCommentsApiPath("p1", "s1")).toBe(
      "/api/projects/p1/stories/s1/comments",
    );
  });

  it("projectStoryAttachmentsApiPath", () => {
    expect(projectStoryAttachmentsApiPath("p1", "s1")).toBe(
      "/api/projects/p1/stories/s1/attachments",
    );
  });

  it("projectStoryAttachmentContentApiPath", () => {
    expect(projectStoryAttachmentContentApiPath("p1", "s1", "a1")).toBe(
      "/api/projects/p1/stories/s1/attachments/a1/content",
    );
  });

  it("projectStoryCommentApiPath", () => {
    expect(projectStoryCommentApiPath("p1", "s1", "c1")).toBe(
      "/api/projects/p1/stories/s1/comments/c1",
    );
  });

  it("projectIterationsApiPath", () => {
    expect(projectIterationsApiPath("p1")).toBe("/api/projects/p1/iterations");
  });

  it("projectIterationStoriesApiPath", () => {
    expect(projectIterationStoriesApiPath("p1", "i1")).toBe(
      "/api/projects/p1/iterations/i1/stories",
    );
  });

  it("projectIterationStoryApiPath", () => {
    expect(projectIterationStoryApiPath("p1", "i1", "s1")).toBe(
      "/api/projects/p1/iterations/i1/stories/s1",
    );
  });

  it("projectLabelsApiPath", () => {
    expect(projectLabelsApiPath("p1")).toBe("/api/projects/p1/labels");
  });

  it("projectApiPath", () => {
    expect(projectApiPath("p1")).toBe("/api/projects/p1");
  });

  it("projectPointScaleApiPath", () => {
    expect(projectPointScaleApiPath("p1")).toBe("/api/projects/p1/point-scale");
  });

  it("projectSettingsPath", () => {
    expect(projectSettingsPath("p1")).toBe("/projects/p1/settings");
  });

  it("projectDeleteApiPath", () => {
    expect(projectDeleteApiPath("p1")).toBe("/api/projects/p1");
  });
});
