import { describe, expect, it } from "vitest";
import type { StoryTimelineActivityEntry } from "../types/story";
import { groupStoryTimelineEntriesByPostDate } from "./story-timeline-grouping";

function activity(id: string, createdAt: string): StoryTimelineActivityEntry {
  return {
    __typename: "StoryTimelineActivityEntry",
    entryType: "activity",
    id,
    storyId: "s1",
    actorUserId: "u1",
    actorName: "Actor",
    action: "field_changed",
    fieldName: "title",
    oldValue: "a",
    newValue: "b",
    createdAt,
  };
}

describe("groupStoryTimelineEntriesByPostDate", () => {
  it("groups entries on the same local day together", () => {
    const groups = groupStoryTimelineEntriesByPostDate([
      activity("1", "2026-01-10T01:00:00.000Z"),
      activity("2", "2026-01-10T10:00:00.000Z"),
      activity("3", "2026-01-11T02:00:00.000Z"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.entries).toHaveLength(2);
    expect(groups[1]?.entries).toHaveLength(1);
    expect(groups[0]?.dateKey).not.toBe(groups[1]?.dateKey);
  });

  it("preserves ascending input order within groups", () => {
    const groups = groupStoryTimelineEntriesByPostDate([
      activity("1", "2026-06-01T08:00:00.000Z"),
      activity("2", "2026-06-01T09:00:00.000Z"),
    ]);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(["1", "2"]);
  });
});
