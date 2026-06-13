import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import { updateStory } from "../src/application/usecases/update-story";
import type { Story } from "../src/domain/entities/story";
import { STORY_ACTIVITY_REPOSITORY_ERROR } from "../src/domain/repositories/story-activity-repository";
import { STORY_REPOSITORY_ERROR } from "../src/domain/repositories/story-repository";

function buildStory(overrides?: Partial<Story>): Story {
  return {
    __typename: "Story",
    id: "story-1",
    projectId: "project-1",
    title: "Original title",
    description: "Original description",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: "2026-03-27T00:00:00.000Z",
    completedAt: null,
    storyPoint: null,
    labels: [],
    epicId: null,
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 1,
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
    ...overrides,
    storyNumber: overrides?.storyNumber ?? 1,
  };
}

describe("updateStory usecase", () => {
  it("records an activity for each changed field", async () => {
    const currentStory = buildStory({ iterationId: "iter-1" });
    const updatedStory = buildStory({
      status: "Started",
      storyPoint: 3,
      iterationId: "iter-1",
      updatedAt: "2026-03-27T01:00:00.000Z",
    });

    const repository = {
      findById: vi.fn().mockResolvedValue(ok(currentStory)),
      update: vi.fn().mockResolvedValue(ok(updatedStory)),
    } as const;
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Started",
        storyPoint: 3,
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isOk()).toBe(true);
    expect(activityRepository.recordMany).toHaveBeenCalledTimes(1);
    const recorded = activityRepository.recordMany.mock.calls[0]?.[0] ?? [];
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({
      projectId: "project-1",
      storyId: "story-1",
      actorUserId: "github|member-1",
      actorName: "member@example.com",
      action: "field_changed",
      fieldName: "status",
      oldValue: "Unstarted",
      newValue: "Started",
    });
    expect(recorded[1]).toMatchObject({
      projectId: "project-1",
      storyId: "story-1",
      actorUserId: "github|member-1",
      actorName: "member@example.com",
      action: "field_changed",
      fieldName: "storyPoint",
      oldValue: null,
      newValue: "3",
    });
    expect(typeof (recorded[0] as { id?: string }).id).toBe("string");
    expect(typeof (recorded[1] as { id?: string }).id).toBe("string");
  });

  it("returns an error when activity recording fails", async () => {
    const repository = {
      findById: vi
        .fn()
        .mockResolvedValue(
          ok(buildStory({ storyPoint: 3, iterationId: "iter-1" })),
        ),
      update: vi.fn().mockResolvedValue(
        ok(
          buildStory({
            status: "Started",
            storyPoint: 3,
            iterationId: "iter-1",
          }),
        ),
      ),
    } as const;
    const activityRepository = {
      recordMany: vi
        .fn()
        .mockResolvedValue(err(STORY_ACTIVITY_REPOSITORY_ERROR)),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Started",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(STORY_ACTIVITY_REPOSITORY_ERROR);
    }
  });

  it("propagates repository errors before recording activities", async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(err(STORY_REPOSITORY_ERROR)),
      update: vi.fn(),
    } as const;
    const activityRepository = {
      recordMany: vi.fn(),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Started",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(STORY_REPOSITORY_ERROR);
    }
    expect(activityRepository.recordMany).not.toHaveBeenCalled();
  });

  it("rejects Start transition when story has no estimate", async () => {
    const currentStory = buildStory({
      status: "Unstarted",
      storyPoint: null,
      iterationId: "iter-1",
    });

    const repository = {
      findById: vi.fn().mockResolvedValue(ok(currentStory)),
      update: vi.fn(),
    } as const;
    const activityRepository = {
      recordMany: vi.fn(),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Started",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        code: "ESTIMATE_REQUIRED_ERROR",
        targetStatus: "Started",
      });
    }
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("allows Start transition when story has an estimate", async () => {
    const currentStory = buildStory({
      status: "Unstarted",
      storyPoint: 3,
      iterationId: "iter-1",
    });
    const updatedStory = buildStory({
      status: "Started",
      storyPoint: 3,
      iterationId: "iter-1",
    });

    const repository = {
      findById: vi.fn().mockResolvedValue(ok(currentStory)),
      update: vi.fn().mockResolvedValue(ok(updatedStory)),
    } as const;
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Started",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isOk()).toBe(true);
  });

  it("allows Delivered -> Rejected transition", async () => {
    const currentStory = buildStory({ status: "Delivered", storyPoint: 5 });
    const updatedStory = buildStory({ status: "Rejected", storyPoint: 5 });

    const repository = {
      findById: vi.fn().mockResolvedValue(ok(currentStory)),
      update: vi.fn().mockResolvedValue(ok(updatedStory)),
    } as const;
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Rejected",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe("Rejected");
    }
  });

  it("allows Rejected -> Started (restart) with estimate", async () => {
    const currentStory = buildStory({
      status: "Rejected",
      storyPoint: 5,
      iterationId: "iter-1",
    });
    const updatedStory = buildStory({
      status: "Started",
      storyPoint: 5,
      iterationId: "iter-1",
    });

    const repository = {
      findById: vi.fn().mockResolvedValue(ok(currentStory)),
      update: vi.fn().mockResolvedValue(ok(updatedStory)),
    } as const;
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Started",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe("Started");
    }
  });

  it("allows Accepted -> Unstarted rollback", async () => {
    const currentStory = buildStory({
      status: "Accepted",
      storyPoint: 3,
      iterationId: null,
    });
    const updatedStory = buildStory({
      status: "Unstarted",
      storyPoint: 3,
      iterationId: null,
    });

    const repository = {
      findById: vi.fn().mockResolvedValue(ok(currentStory)),
      update: vi.fn().mockResolvedValue(ok(updatedStory)),
    } as const;
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Unstarted",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe("Unstarted");
    }
    expect(activityRepository.recordMany).toHaveBeenCalledWith([
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "github|member-1",
        actorName: "member@example.com",
        fieldName: "status",
        oldValue: "Accepted",
        newValue: "Unstarted",
      }),
    ]);
  });

  it("allows Accepted -> Started rollback", async () => {
    const currentStory = buildStory({
      status: "Accepted",
      storyPoint: 3,
      iterationId: null,
    });
    const updatedStory = buildStory({
      status: "Started",
      storyPoint: 3,
      iterationId: null,
    });

    const repository = {
      findById: vi.fn().mockResolvedValue(ok(currentStory)),
      update: vi.fn().mockResolvedValue(ok(updatedStory)),
    } as const;
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Started",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe("Started");
    }
  });

  it("allows transition to Started even when iteration is not assigned", async () => {
    const currentStory = buildStory({
      status: "Unstarted",
      iterationId: null,
      storyPoint: 3,
    });
    const updatedStory = buildStory({
      status: "Started",
      iterationId: null,
      storyPoint: 3,
    });

    const repository = {
      findById: vi.fn().mockResolvedValue(ok(currentStory)),
      update: vi.fn().mockResolvedValue(ok(updatedStory)),
    } as const;
    const activityRepository = {
      recordMany: vi.fn().mockResolvedValue(ok(undefined)),
    } as const;

    const result = await updateStory(
      repository as never,
      activityRepository as never,
      {
        projectId: "project-1",
        id: "story-1",
        status: "Started",
        actor: {
          id: "github|member-1",
          name: "member@example.com",
        },
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe("Started");
    }
  });
});
