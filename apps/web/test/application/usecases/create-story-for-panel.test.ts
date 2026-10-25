import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { Story } from "../../../src/domain/entities/story";
import type { StoryRepository } from "../../../src/domain/repositories/story-repository";
import type { StoryActivityRepository } from "../../../src/domain/repositories/story-activity-repository";
import type { IterationRepository } from "../../../src/domain/repositories/iteration-repository";
import {
  createStoryForPanel,
  CURRENT_ITERATION_ASSIGN_FAILED_ERROR,
  CURRENT_ITERATION_ASSIGN_ROLLBACK_FAILED_ERROR,
  CURRENT_ITERATION_NOT_FOUND_ERROR,
} from "../../../src/application/usecases/create-story-for-panel";

const NOW = "2026-04-25T00:00:00.000Z";

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    __typename: "Story",
    id: "story-1",
    projectId: "project-1",
    title: "Story title",
    description: "Story description",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: NOW,
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    storyNumber: overrides.storyNumber ?? 1,
  };
}

function createStoryRepository() {
  const create = vi.fn(async (input) => ok(makeStory({ ...input })));
  const repository: StoryRepository = {
    create,
    findById: vi.fn(async () => ok(null)),
    findByStoryNumber: vi.fn(async () => ok(null)),
    update: vi.fn(async () => ok(null)),
    delete: vi.fn(async () => ok(true)),
    list: vi.fn(async () => ok([])),
    summarize: vi.fn(async () =>
      ok({ total: 0, totalPoints: 0, pointsByIterationId: {} }),
    ),
    reorder: vi.fn(async () => ok([])),
    reassignStoriesAcrossIterations: vi.fn(async () => ok(0)),
    listPriorityHistory: vi.fn(async () => ok([])),
    addBlocker: vi.fn(async () => ok(undefined)),
    removeBlocker: vi.fn(async () => ok(true)),
    listByOwnerAcrossProjects: vi.fn(async () => ok([])),
    listAcceptedForIterationRebuild: vi.fn(async () => ok([])),
  };
  return { repository, create };
}

function createActivityRepository() {
  const repository: StoryActivityRepository = {
    recordMany: vi.fn(async () => ok(undefined)),
    listByStory: vi.fn(async () => ok([])),
    listByProject: vi.fn(async () =>
      ok({ entries: [], hasMore: false, nextBefore: null }),
    ),
  };
  return repository;
}

function createIterationRepository() {
  const iteration = {
    __typename: "Iteration" as const,
    id: "it-current",
    projectId: "project-1",
    iterationNumber: 1,
    startDate: "2026-04-20",
    endDate: "2026-05-01",
    totalPoints: 0,
    effectiveSprintUtilizationPercent: 100,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const list = vi.fn(async () => ok([iteration]));
  const assignStory = vi.fn(async () => ok(true));
  const repository: IterationRepository = {
    create: vi.fn(async () => ok(iteration)),
    list,
    findById: vi.fn(async () => ok(iteration)),
    delete: vi.fn(async () => ok(true)),
    findLatest: vi.fn(async () => ok(iteration)),
    deleteFuture: vi.fn(async () => ok(0)),
    deleteAll: vi.fn(async () => ok(0)),
    assignStory,
    unassignStory: vi.fn(async () => ok(true)),
    updateUtilization: vi.fn(async () =>
      ok({
        __typename: "IterationOverride" as const,
        id: "override-1",
        projectId: "project-1",
        iterationNumber: 1,
        sprintUtilizationPercent: 100,
        iterationStartDate: "2026-04-20",
        iterationEndDate: "2026-05-01",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ),
    deleteUtilizationOverride: vi.fn(async () => ok(true)),
    listOverrides: vi.fn(async () => ok([])),
  };
  return { repository, list, assignStory };
}

describe("createStoryForPanel", () => {
  it("creates story in icebox with isIcebox=true", async () => {
    const storyRepo = createStoryRepository();
    const activityRepo = createActivityRepository();
    const iterationRepo = createIterationRepository();

    const result = await createStoryForPanel(
      storyRepo.repository,
      activityRepo,
      iterationRepo.repository,
      {
        projectId: "project-1",
        panel: "icebox",
        title: "Title",
        description: "Description",
        type: "feature",
        status: "Unstarted",
        storyPoint: null,
        labels: [],
        actorUserId: "u1",
        actorName: "owner",
      },
      { now: () => new Date(NOW) },
    );

    expect(result.isOk()).toBe(true);
    expect(storyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ isIcebox: true }),
    );
    expect(iterationRepo.assignStory).not.toHaveBeenCalled();
  });

  it("creates story in current and assigns current iteration", async () => {
    const storyRepo = createStoryRepository();
    const activityRepo = createActivityRepository();
    const iterationRepo = createIterationRepository();

    const result = await createStoryForPanel(
      storyRepo.repository,
      activityRepo,
      iterationRepo.repository,
      {
        projectId: "project-1",
        panel: "current",
        title: "Title",
        description: "Description",
        type: "feature",
        status: "Unstarted",
        storyPoint: null,
        labels: [],
        actorUserId: "u1",
        actorName: "owner",
      },
      { now: () => new Date(NOW) },
    );

    expect(result.isOk()).toBe(true);
    expect(storyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ isIcebox: false }),
    );
    expect(iterationRepo.assignStory).toHaveBeenCalledWith({
      projectId: "project-1",
      iterationId: "it-current",
      storyId: "story-1",
    });
    expect(result._unsafeUnwrap().iterationId).toBe("it-current");
  });

  it("returns not-found error when current iteration does not exist", async () => {
    const storyRepo = createStoryRepository();
    const activityRepo = createActivityRepository();
    const iterationRepo = createIterationRepository();
    iterationRepo.list.mockResolvedValueOnce(ok([]));

    const result = await createStoryForPanel(
      storyRepo.repository,
      activityRepo,
      iterationRepo.repository,
      {
        projectId: "project-1",
        panel: "current",
        title: "Title",
        description: "Description",
        type: "feature",
        status: "Unstarted",
        storyPoint: null,
        labels: [],
        actorUserId: "u1",
        actorName: "owner",
      },
      { now: () => new Date(NOW) },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe(CURRENT_ITERATION_NOT_FOUND_ERROR);
    expect(storyRepo.create).not.toHaveBeenCalled();
  });

  it("rolls back when current assignment fails", async () => {
    const storyRepo = createStoryRepository();
    const activityRepo = createActivityRepository();
    const iterationRepo = createIterationRepository();
    iterationRepo.assignStory.mockResolvedValueOnce(ok(false));

    const result = await createStoryForPanel(
      storyRepo.repository,
      activityRepo,
      iterationRepo.repository,
      {
        projectId: "project-1",
        panel: "current",
        title: "Title",
        description: "Description",
        type: "feature",
        status: "Unstarted",
        storyPoint: null,
        labels: [],
        actorUserId: "u1",
        actorName: "owner",
      },
      { now: () => new Date(NOW) },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe(
      CURRENT_ITERATION_ASSIGN_FAILED_ERROR,
    );
    expect(storyRepo.repository.delete).toHaveBeenCalledWith(
      "project-1",
      "story-1",
    );
  });

  it("returns rollback failed error when delete fails after assign error", async () => {
    const storyRepo = createStoryRepository();
    const activityRepo = createActivityRepository();
    const iterationRepo = createIterationRepository();
    iterationRepo.assignStory.mockResolvedValueOnce(ok(false));
    vi.mocked(storyRepo.repository.delete).mockResolvedValueOnce(ok(false));

    const result = await createStoryForPanel(
      storyRepo.repository,
      activityRepo,
      iterationRepo.repository,
      {
        projectId: "project-1",
        panel: "current",
        title: "Title",
        description: "Description",
        type: "feature",
        status: "Unstarted",
        storyPoint: null,
        labels: [],
        actorUserId: "u1",
        actorName: "owner",
      },
      { now: () => new Date(NOW) },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe(
      CURRENT_ITERATION_ASSIGN_ROLLBACK_FAILED_ERROR,
    );
  });
});
