import { ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import {
  buildIterationRangesForRebuild,
  calculateVelocity,
  iterationWindowContaining,
  rebuildIterations,
} from "../src/application/usecases/manage-iterations";
import type { Iteration } from "../src/domain/entities/iteration";
import type { Story } from "../src/domain/entities/story";

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

describe("calculateVelocity", () => {
  const todayIso = "2026-04-14";

  it("returns default initial velocity for empty iterations", () => {
    expect(calculateVelocity([], { todayIso })).toBe(10);
  });

  it("returns default initial velocity when no iterations are completed", () => {
    const iterations = [
      makeIteration({ endDate: "2099-12-31", totalPoints: 10 }),
    ];
    expect(calculateVelocity(iterations, { todayIso })).toBe(10);
  });

  it("averages total points of completed iterations inside last 21 days", () => {
    const iterations = [
      makeIteration({
        id: "i1",
        startDate: "2026-03-20",
        endDate: "2026-03-25",
        totalPoints: 10,
      }),
      makeIteration({
        id: "i2",
        startDate: "2026-03-28",
        endDate: "2026-04-07",
        totalPoints: 20,
      }),
      makeIteration({
        id: "i3",
        startDate: "2026-02-10",
        endDate: "2026-03-01",
        totalPoints: 99,
      }),
    ];
    // Only i1 and i2 are in [today-21days, today)
    expect(calculateVelocity(iterations, { todayIso })).toBe(15);
  });

  it("includes the 21-day boundary and excludes out-of-window iterations", () => {
    const iterations = [
      makeIteration({
        id: "i0",
        startDate: "2026-03-18",
        endDate: "2026-03-23",
        totalPoints: 50,
      }),
      makeIteration({
        id: "i1",
        startDate: "2026-03-20",
        endDate: "2026-03-24",
        totalPoints: 6,
      }),
      makeIteration({
        id: "i2",
        startDate: "2026-03-24",
        endDate: "2026-03-25",
        totalPoints: 9,
      }),
      makeIteration({
        id: "i3",
        startDate: "2026-03-25",
        endDate: "2026-03-26",
        totalPoints: 12,
      }),
      makeIteration({
        id: "i4",
        startDate: "2026-04-01",
        endDate: "2026-04-15",
        totalPoints: 20,
      }),
    ];
    // today=2026-04-14 => window starts at 2026-03-24
    // i0 is out-of-window; i4 is not completed yet.
    expect(calculateVelocity(iterations, { todayIso })).toBe(9);
  });

  it("falls back to initial velocity when completed iterations exist only outside the window", () => {
    const iterations = [
      makeIteration({
        id: "i1",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        totalPoints: 30,
      }),
    ];

    expect(calculateVelocity(iterations, { todayIso })).toBe(10);
  });
});

describe("iterationWindowContaining", () => {
  it("returns a Monday-aligned 14-day window containing the anchor date", () => {
    const w = iterationWindowContaining(1, 14, "2026-04-08");
    expect(w.startDate).toBe("2026-04-06");
    expect(w.endDate).toBe("2026-04-20");
  });
});

describe("buildIterationRangesForRebuild", () => {
  it("covers historical completions, today, and one sprint beyond the current window", () => {
    const ranges = buildIterationRangesForRebuild({
      iterationStartDay: 1,
      sprintDurationDays: 14,
      today: "2026-04-08",
      completionDates: ["2026-01-05"],
      oldIterationStartDates: [],
    });
    expect(ranges.length).toBeGreaterThan(0);
    const janWindow = iterationWindowContaining(1, 14, "2026-01-05");
    expect(ranges[0].startDate <= janWindow.startDate).toBe(true);
    const todayWindow = iterationWindowContaining(1, 14, "2026-04-08");
    expect(ranges[ranges.length - 1].endDate >= todayWindow.endDate).toBe(true);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].startDate).toBe(ranges[i - 1].endDate);
    }
    for (const r of ranges) {
      const start = new Date(`${r.startDate}T00:00:00`);
      const end = new Date(`${r.endDate}T00:00:00`);
      expect((end.getTime() - start.getTime()) / 86400000).toBe(14);
    }
  });
});

describe("rebuildIterations", () => {
  it("keeps non-Accepted stories on mapped iterations", async () => {
    const oldIterations: Iteration[] = [
      makeIteration({
        id: "it-old-1",
        iterationNumber: 1,
        startDate: "2026-04-07",
        endDate: "2026-04-21",
      }),
      makeIteration({
        id: "it-old-2",
        iterationNumber: 2,
        startDate: "2026-04-21",
        endDate: "2026-05-05",
      }),
    ];
    const newIterations: Iteration[] = [
      makeIteration({
        id: "it-new-1",
        iterationNumber: 1,
        startDate: "2026-04-06",
        endDate: "2026-04-13",
      }),
      makeIteration({
        id: "it-new-2",
        iterationNumber: 2,
        startDate: "2026-04-13",
        endDate: "2026-04-20",
      }),
      makeIteration({
        id: "it-new-3",
        iterationNumber: 3,
        startDate: "2026-04-20",
        endDate: "2026-04-27",
      }),
    ];

    const stories: Story[] = [
      {
        __typename: "Story",
        id: "story-started",
        storyNumber: 1,
        projectId: "project-1",
        title: "started",
        description: "",
        type: "feature",
        status: "Started",
        statusChangedAt: "2026-04-10T00:00:00.000Z",
        completedAt: null,
        storyPoint: 3,
        labels: [],
        epicId: null,
        iterationId: "it-old-1",
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: null,
        position: 1,
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
      },
      {
        __typename: "Story",
        id: "story-accepted",
        storyNumber: 2,
        projectId: "project-1",
        title: "accepted",
        description: "",
        type: "feature",
        status: "Accepted",
        statusChangedAt: "2026-04-12T00:00:00.000Z",
        completedAt: "2026-04-12T00:00:00.000Z",
        storyPoint: 5,
        labels: [],
        epicId: null,
        iterationId: "it-old-1",
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: null,
        position: 2,
        createdAt: "2026-04-12T00:00:00.000Z",
        updatedAt: "2026-04-12T00:00:00.000Z",
      },
    ];

    const assignStory = vi.fn(async () => ok(true));
    const list = vi
      .fn()
      .mockResolvedValueOnce(ok(oldIterations))
      .mockResolvedValueOnce(ok(newIterations));

    const iterationRepository = {
      create: vi.fn(async () => ok(newIterations[0])),
      list,
      findById: vi.fn(async () => ok(null)),
      delete: vi.fn(async () => ok(true)),
      findLatest: vi.fn(async () => ok(oldIterations[1])),
      deleteFuture: vi.fn(async () => ok(0)),
      deleteAll: vi.fn(async () => ok(oldIterations.length)),
      assignStory,
      unassignStory: vi.fn(async () => ok(true)),
      updateUtilization: vi.fn(async () =>
        ok({
          __typename: "IterationOverride" as const,
          id: "ov-1",
          projectId: "project-1",
          iterationNumber: 1,
          sprintUtilizationPercent: 100,
          iterationStartDate: null,
          iterationEndDate: null,
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
        }),
      ),
      deleteUtilizationOverride: vi.fn(async () => ok(true)),
      listOverrides: vi.fn(async () => ok([])),
    };

    const storyRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(async () => ok(stories)),
      summarize: vi.fn(),
      reorder: vi.fn(),
      listPriorityHistory: vi.fn(),
      addBlocker: vi.fn(),
      removeBlocker: vi.fn(),
      listByOwnerAcrossProjects: vi.fn(),
      listAcceptedForIterationRebuild: vi.fn(async () =>
        ok([
          {
            id: "story-accepted",
            completedAt: "2026-04-12T00:00:00.000Z",
            statusChangedAt: "2026-04-12T00:00:00.000Z",
          },
        ]),
      ),
    };

    const result = await rebuildIterations(
      iterationRepository as never,
      storyRepository as never,
      {
        projectId: "project-1",
        iterationStartDay: 1,
        sprintDurationDays: 7,
        today: "2026-04-15",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(assignStory).toHaveBeenCalledWith({
      projectId: "project-1",
      iterationId: "it-new-1",
      storyId: "story-accepted",
    });
    expect(assignStory).toHaveBeenCalledWith({
      projectId: "project-1",
      iterationId: "it-new-1",
      storyId: "story-started",
    });
    expect(assignStory).toHaveBeenCalledTimes(2);
  });
});
