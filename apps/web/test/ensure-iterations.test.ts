import { describe, expect, it } from "vitest";
import {
  backfillIncompleteStoriesIntoCurrentIteration,
  ensureCurrentIteration,
} from "../src/application/usecases/manage-iterations";
import type { Iteration } from "../src/domain/entities/iteration";
import { CARRY_OVER_STORY_STATUSES } from "../src/domain/entities/story";
import type { IterationRepository } from "../src/domain/repositories/iteration-repository";
import {
  STORY_REPOSITORY_ERROR,
  type StoryRepository,
} from "../src/domain/repositories/story-repository";
import { err, ok } from "neverthrow";

function makeIteration(overrides: Partial<Iteration> = {}): Iteration {
  return {
    __typename: "Iteration",
    id: "iter-1",
    projectId: "project-1",
    iterationNumber: 1,
    startDate: "2026-01-01",
    endDate: "2026-01-15",
    totalPoints: 0,
    effectiveSprintUtilizationPercent: 100,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createMockRepository(options: {
  latest: Iteration | null;
  created?: Iteration[];
}): IterationRepository & {
  getCreated(): Iteration[];
  getDeleteFutureCalls(): Array<{ projectId: string; date: string }>;
} {
  const created: Iteration[] = [];
  const deleteFutureCalls: Array<{ projectId: string; date: string }> = [];
  let createCount = 0;
  let latestCleared = false;

  return {
    getCreated: () => created,
    getDeleteFutureCalls: () => deleteFutureCalls,
    findLatest: async () => {
      if (latestCleared) return ok(null);
      // After creates, return the latest created one
      if (created.length > 0) return ok(created[created.length - 1]);
      return ok(options.latest);
    },
    create: async (input) => {
      createCount++;
      const iteration = makeIteration({
        id: `iter-new-${createCount}`,
        projectId: input.projectId,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      created.push(iteration);
      return ok(iteration);
    },
    deleteFuture: async (projectId, date) => {
      deleteFutureCalls.push({ projectId, date });
      latestCleared = true;
      return ok(1);
    },
    deleteAll: async () => ok(0),
    list: async () => ok([]),
    findById: async () => ok(null),
    delete: async () => ok(true),
    assignStory: async () => ok(true),
    unassignStory: async () => ok(true),
    updateUtilization: async () =>
      ok({
        __typename: "IterationOverride",
        id: "override-1",
        projectId: "project-1",
        iterationNumber: 1,
        sprintUtilizationPercent: 80,
        iterationStartDate: null,
        iterationEndDate: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    deleteUtilizationOverride: async () => ok(true),
    listOverrides: async () => ok([]),
  };
}

describe("ensureCurrentIteration", () => {
  const baseInput = {
    projectId: "project-1",
    sprintDurationDays: 14 as const,
    iterationStartDay: 1 as const, // Monday
    today: "2026-04-08", // Wednesday
  };

  it("creates initial iteration when none exist", async () => {
    const repo = createMockRepository({ latest: null });

    const result = await ensureCurrentIteration(repo, baseInput);

    expect(result.isOk()).toBe(true);
    const created = repo.getCreated();
    expect(created).toHaveLength(1);
    // Should start on the most recent Monday (2026-04-06)
    expect(created[0].startDate).toBe("2026-04-06");
    expect(created[0].endDate).toBe("2026-04-20");
  });

  it("does nothing when latest iteration contains today", async () => {
    const repo = createMockRepository({
      latest: makeIteration({
        startDate: "2026-04-06",
        endDate: "2026-04-20",
      }),
    });

    const result = await ensureCurrentIteration(repo, baseInput);

    expect(result.isOk()).toBe(true);
    expect(repo.getCreated()).toHaveLength(0);
  });

  it("creates next iteration when latest is in the past", async () => {
    const repo = createMockRepository({
      latest: makeIteration({
        startDate: "2026-03-23",
        endDate: "2026-04-06",
      }),
    });

    const result = await ensureCurrentIteration(repo, baseInput);

    expect(result.isOk()).toBe(true);
    const created = repo.getCreated();
    expect(created).toHaveLength(1);
    expect(created[0].startDate).toBe("2026-04-06");
    expect(created[0].endDate).toBe("2026-04-20");
  });

  it("creates multiple iterations to fill gap", async () => {
    const repo = createMockRepository({
      latest: makeIteration({
        startDate: "2026-03-01",
        endDate: "2026-03-15",
      }),
    });

    const result = await ensureCurrentIteration(repo, baseInput);

    expect(result.isOk()).toBe(true);
    const created = repo.getCreated();
    // 03-15 → 03-29, 03-29 → 04-12 (contains 04-08)
    expect(created).toHaveLength(2);
    expect(created[0].startDate).toBe("2026-03-15");
    expect(created[0].endDate).toBe("2026-03-29");
    expect(created[1].startDate).toBe("2026-03-29");
    expect(created[1].endDate).toBe("2026-04-12");
  });

  it("handles duration change: old 7-day iterations, new 14-day", async () => {
    const repo = createMockRepository({
      latest: makeIteration({
        startDate: "2026-03-30",
        endDate: "2026-04-06", // old 7-day iteration
      }),
    });

    // New settings: 14-day sprints
    const result = await ensureCurrentIteration(repo, {
      ...baseInput,
      sprintDurationDays: 14,
    });

    expect(result.isOk()).toBe(true);
    const created = repo.getCreated();
    expect(created).toHaveLength(1);
    // Starts from old endDate, uses new duration
    expect(created[0].startDate).toBe("2026-04-06");
    expect(created[0].endDate).toBe("2026-04-20");
  });

  it("uses iterationStartDay for initial iteration alignment", async () => {
    const repo = createMockRepository({ latest: null });

    // Sunday start, 7-day sprints, today is Wednesday 2026-04-08
    const result = await ensureCurrentIteration(repo, {
      ...baseInput,
      iterationStartDay: 0, // Sunday
      sprintDurationDays: 7,
    });

    expect(result.isOk()).toBe(true);
    const created = repo.getCreated();
    expect(created).toHaveLength(1);
    // Most recent Sunday before 04-08 is 04-05
    expect(created[0].startDate).toBe("2026-04-05");
    expect(created[0].endDate).toBe("2026-04-12");
  });

  it("deletes future iterations and creates correct one when latest is in the future", async () => {
    const repo = createMockRepository({
      latest: makeIteration({
        startDate: "2026-04-20",
        endDate: "2026-05-04",
      }),
    });

    // today is Wednesday 2026-04-08, but latest iteration starts 2026-04-20
    const result = await ensureCurrentIteration(repo, baseInput);

    expect(result.isOk()).toBe(true);

    // Should have called deleteFuture
    const deleteCalls = repo.getDeleteFutureCalls();
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].projectId).toBe("project-1");
    expect(deleteCalls[0].date).toBe("2026-04-08");

    // Should create an iteration containing today
    const created = repo.getCreated();
    expect(created).toHaveLength(1);
    expect(created[0].startDate).toBe("2026-04-06"); // Most recent Monday
    expect(created[0].endDate).toBe("2026-04-20");
  });

  it("creates iteration starting today when today matches start day", async () => {
    const repo = createMockRepository({ latest: null });

    // Monday start, today is Monday 2026-04-06
    const result = await ensureCurrentIteration(repo, {
      ...baseInput,
      sprintDurationDays: 7,
      today: "2026-04-06",
    });

    expect(result.isOk()).toBe(true);
    const created = repo.getCreated();
    expect(created[0].startDate).toBe("2026-04-06");
    expect(created[0].endDate).toBe("2026-04-13");
  });
});

describe("backfillIncompleteStoriesIntoCurrentIteration", () => {
  function createStoryRepositoryMock(): StoryRepository & {
    calls: Array<{
      projectId: string;
      fromIterationId: string;
      toIterationId: string;
      statuses: string[];
    }>;
  } {
    const calls: Array<{
      projectId: string;
      fromIterationId: string;
      toIterationId: string;
      statuses: string[];
    }> = [];
    return {
      calls,
      create: async () => {
        throw new Error("not implemented");
      },
      findById: async () => ok(null),
      findByStoryNumber: async () => ok(null),
      update: async () => ok(null),
      delete: async () => ok(false),
      list: async () => ok([]),
      summarize: async () =>
        ok({ total: 0, totalPoints: 0, pointsByIterationId: {} }),
      reorder: async () => ok([]),
      reassignStoriesAcrossIterations: async (input) => {
        calls.push(input as (typeof calls)[number]);
        return ok(2);
      },
      listPriorityHistory: async () => ok([]),
      addBlocker: async () => ok(undefined),
      removeBlocker: async () => ok(true),
      listByOwnerAcrossProjects: async () => ok([]),
      listAcceptedForIterationRebuild: async () => ok([]),
    };
  }

  it("moves incomplete stories from previous iteration to current", async () => {
    const repo = createMockRepository({
      latest: makeIteration({
        id: "iter-current",
        startDate: "2026-04-06",
        endDate: "2026-04-20",
      }),
    });
    repo.list = async () =>
      ok([
        makeIteration({
          id: "iter-prev",
          startDate: "2026-03-23",
          endDate: "2026-04-06",
        }),
        makeIteration({
          id: "iter-current",
          startDate: "2026-04-06",
          endDate: "2026-04-20",
        }),
      ]);

    const storyRepo = createStoryRepositoryMock();
    const result = await backfillIncompleteStoriesIntoCurrentIteration(
      repo,
      storyRepo,
      {
        projectId: "project-1",
        today: "2026-04-08",
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error("expected ok result");
    }
    expect(result.value).toBe(2);
    expect(storyRepo.calls).toEqual([
      {
        projectId: "project-1",
        fromIterationId: "iter-prev",
        toIterationId: "iter-current",
        statuses: [...CARRY_OVER_STORY_STATUSES],
      },
    ]);
  });

  it("returns zero when no current iteration exists", async () => {
    const repo = createMockRepository({ latest: null });
    repo.list = async () =>
      ok([
        makeIteration({
          id: "iter-prev",
          startDate: "2026-03-01",
          endDate: "2026-03-15",
        }),
      ]);

    const storyRepo = createStoryRepositoryMock();
    const result = await backfillIncompleteStoriesIntoCurrentIteration(
      repo,
      storyRepo,
      {
        projectId: "project-1",
        today: "2026-04-08",
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error("expected ok result");
    }
    expect(result.value).toBe(0);
    expect(storyRepo.calls).toHaveLength(0);
  });

  it("propagates story reassign errors", async () => {
    const repo = createMockRepository({ latest: null });
    repo.list = async () =>
      ok([
        makeIteration({
          id: "iter-prev",
          startDate: "2026-03-01",
          endDate: "2026-03-15",
        }),
        makeIteration({
          id: "iter-current",
          startDate: "2026-03-15",
          endDate: "2026-03-29",
        }),
      ]);
    const storyRepo = createStoryRepositoryMock();
    storyRepo.reassignStoriesAcrossIterations = async () =>
      err(STORY_REPOSITORY_ERROR);

    const result = await backfillIncompleteStoriesIntoCurrentIteration(
      repo,
      storyRepo,
      {
        projectId: "project-1",
        today: "2026-03-20",
      },
    );

    expect(result.isErr()).toBe(true);
  });
});
