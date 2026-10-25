import { ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import {
  createStory,
  INVALID_STORY_INITIAL_STATUS_ERROR,
} from "../src/application/usecases/create-story";

describe("createStory initial status", () => {
  const build = (status: string) => {
    const repository = {
      create: vi.fn().mockResolvedValue(ok({ id: "s1", ownerIds: [] })),
    };
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    };
    return {
      repository,
      run: () =>
        createStory(repository as never, activityRepository as never, {
          projectId: "project-1",
          title: "New story",
          description: "",
          type: "feature",
          status,
          storyPoint: 3,
          labels: [],
          actorUserId: "user-1",
          actorName: "user",
        }),
    };
  };

  it("creates an Unstarted story", async () => {
    const { run, repository } = build("Unstarted");
    expect((await run()).isOk()).toBe(true);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    "Started",
    "Finished",
    "Delivered",
    "Accepted",
    "Rejected",
  ])("rejects creating a story as %s", async (status) => {
    const { run, repository } = build(status);
    expect((await run())._unsafeUnwrapErr()).toBe(
      INVALID_STORY_INITIAL_STATUS_ERROR,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
});
