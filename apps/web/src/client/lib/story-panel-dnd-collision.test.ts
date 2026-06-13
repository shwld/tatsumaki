import { describe, expect, it } from "vitest";

import { pickPreferredStoryCollisions } from "./story-panel-dnd-collision";

describe("pickPreferredStoryCollisions", () => {
  it("prefers story ids over group and panel drop-zone shells", () => {
    const collisions = [
      { id: "drop-zone-group:CurrentBacklogCombined:iter-1" },
      { id: "story-b" },
      { id: "drop-zone-Backlog" },
    ];
    expect(pickPreferredStoryCollisions(collisions)).toEqual([
      { id: "story-b" },
    ]);
  });

  it("falls back to shell collisions when no story id is present", () => {
    const collisions = [
      { id: "drop-zone-group:CurrentBacklogCombined:x" },
      { id: "drop-zone-Backlog" },
    ];
    expect(pickPreferredStoryCollisions(collisions)).toEqual(collisions);
  });
});
