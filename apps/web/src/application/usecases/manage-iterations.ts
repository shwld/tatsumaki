import { err, ok, type Result } from "neverthrow";
import type {
  Iteration,
  IterationOverride,
} from "../../domain/entities/iteration";
import {
  CARRY_OVER_STORY_STATUSES,
  type StoryStatus,
} from "../../domain/entities/story";
import type {
  AcceptedStoryIterationAnchor,
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";
import type {
  IterationStartDay,
  SprintDuration,
} from "../../domain/entities/project";
import type {
  IterationRepository,
  IterationRepositoryError,
} from "../../domain/repositories/iteration-repository";

export type ManageIterationError =
  | IterationRepositoryError
  | StoryRepositoryError;

export type RebuildIterationsError =
  | IterationRepositoryError
  | StoryRepositoryError;

export async function listIterations(
  repository: IterationRepository,
  projectId: string,
): Promise<Result<Iteration[], IterationRepositoryError>> {
  return repository.list(projectId);
}

export async function assignStoryToIteration(
  repository: IterationRepository,
  input: {
    projectId: string;
    iterationId: string;
    storyId: string;
  },
): Promise<Result<boolean, IterationRepositoryError>> {
  return repository.assignStory(input);
}

export async function unassignStoryFromIteration(
  repository: IterationRepository,
  input: {
    projectId: string;
    storyId: string;
  },
): Promise<Result<boolean, IterationRepositoryError>> {
  return repository.unassignStory(input);
}

export async function updateIterationUtilization(
  repository: IterationRepository,
  input: {
    projectId: string;
    iterationNumber: number;
    sprintUtilizationPercent: number;
    iterationStartDate?: string | null;
    iterationEndDate?: string | null;
  },
): Promise<Result<IterationOverride, IterationRepositoryError>> {
  return repository.updateUtilization(input);
}

export async function deleteIterationUtilizationOverride(
  repository: IterationRepository,
  input: {
    projectId: string;
    iterationNumber: number;
  },
): Promise<Result<boolean, IterationRepositoryError>> {
  return repository.deleteUtilizationOverride(input);
}

export async function listIterationOverrides(
  repository: IterationRepository,
  projectId: string,
): Promise<Result<IterationOverride[], IterationRepositoryError>> {
  return repository.listOverrides(projectId);
}

/**
 * Compute the first iteration boundary containing `today` for a brand-new project.
 * Finds the most recent occurrence of `iterationStartDay` on or before `today`,
 * then returns [startDate, startDate + sprintDurationDays).
 */
function computeInitialIteration(
  iterationStartDay: IterationStartDay,
  sprintDurationDays: SprintDuration,
  today: string,
): { startDate: string; endDate: string } {
  const todayDate = new Date(`${today}T00:00:00`);
  const todayDow = todayDate.getDay();

  const daysBack = (todayDow - iterationStartDay + 7) % 7;
  const start = new Date(todayDate);
  start.setDate(start.getDate() - daysBack);

  const end = new Date(start);
  end.setDate(start.getDate() + sprintDurationDays);

  return { startDate: formatDate(start), endDate: formatDate(end) };
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function toDateOnly(isoTimestampOrDate: string): string {
  return isoTimestampOrDate.slice(0, 10);
}

function completionDateForRebuild(
  anchor: AcceptedStoryIterationAnchor,
): string {
  if (anchor.completedAt) {
    return toDateOnly(anchor.completedAt);
  }
  return toDateOnly(anchor.statusChangedAt);
}

function acceptedCompletionDate(story: {
  completedAt: string | null;
  statusChangedAt: string;
}): string {
  if (story.completedAt) {
    return toDateOnly(story.completedAt);
  }
  return toDateOnly(story.statusChangedAt);
}

/** Sprint window [startDate, endDate) that contains `anchorDate` under project calendar rules. */
export function iterationWindowContaining(
  iterationStartDay: IterationStartDay,
  sprintDurationDays: SprintDuration,
  anchorDate: string,
): { startDate: string; endDate: string } {
  return computeInitialIteration(
    iterationStartDay,
    sprintDurationDays,
    anchorDate,
  );
}

export function buildIterationRangesForRebuild(input: {
  iterationStartDay: IterationStartDay;
  sprintDurationDays: SprintDuration;
  today: string;
  completionDates: string[];
  oldIterationStartDates: string[];
}): Array<{ startDate: string; endDate: string }> {
  const anchors: string[] = [
    input.today,
    ...input.completionDates,
    ...input.oldIterationStartDates,
  ];
  if (anchors.length === 0) {
    anchors.push(input.today);
  }

  const windows = anchors.map((d) => {
    return iterationWindowContaining(
      input.iterationStartDay,
      input.sprintDurationDays,
      d,
    );
  });

  const minStart = windows.reduce((min, w) => {
    return w.startDate < min ? w.startDate : min;
  }, windows[0].startDate);

  const todayWindow = iterationWindowContaining(
    input.iterationStartDay,
    input.sprintDurationDays,
    input.today,
  );

  let endExclusive = addDays(todayWindow.endDate, input.sprintDurationDays);

  const maxAnchor = anchors.reduce((max, d) => {
    return d > max ? d : max;
  }, anchors[0]);
  const maxWindow = iterationWindowContaining(
    input.iterationStartDay,
    input.sprintDurationDays,
    maxAnchor,
  );
  if (maxWindow.endDate > endExclusive) {
    endExclusive = maxWindow.endDate;
  }

  const ranges: Array<{ startDate: string; endDate: string }> = [];
  let cursor = minStart;
  while (cursor < endExclusive) {
    const next = addDays(cursor, input.sprintDurationDays);
    ranges.push({ startDate: cursor, endDate: next });
    cursor = next;
  }
  return ranges;
}

function findIterationContaining(
  iterations: Iteration[],
  date: string,
): Iteration | null {
  for (const it of iterations) {
    if (it.startDate <= date && date < it.endDate) {
      return it;
    }
  }
  return null;
}

function resolveIterationForDate(
  iterations: Iteration[],
  date: string,
): Iteration | null {
  const exact = findIterationContaining(iterations, date);
  if (exact) {
    return exact;
  }
  if (iterations.length === 0) {
    return null;
  }

  const sorted = [...iterations].sort((a, b) => {
    return a.startDate.localeCompare(b.startDate);
  });

  let candidate: Iteration | null = null;
  for (const it of sorted) {
    if (it.startDate <= date) {
      candidate = it;
      continue;
    }
    break;
  }

  return candidate ?? sorted[0];
}

export async function rebuildIterations(
  iterationRepository: IterationRepository,
  storyRepository: StoryRepository,
  input: {
    projectId: string;
    iterationStartDay: IterationStartDay;
    sprintDurationDays: SprintDuration;
    today: string;
  },
): Promise<Result<void, RebuildIterationsError>> {
  const oldIterationsResult = await iterationRepository.list(input.projectId);
  if (oldIterationsResult.isErr()) {
    return err(oldIterationsResult.error);
  }
  const oldIterations = oldIterationsResult.value;
  const oldById = new Map(
    oldIterations.map((it) => {
      return [it.id, it] as const;
    }),
  );
  const oldByNumber = new Map(
    oldIterations.map((it) => {
      return [it.iterationNumber, it] as const;
    }),
  );

  const overridesResult = await iterationRepository.listOverrides(
    input.projectId,
  );
  if (overridesResult.isErr()) {
    return err(overridesResult.error);
  }
  const oldOverrides = overridesResult.value;

  const acceptedResult = await storyRepository.listAcceptedForIterationRebuild(
    input.projectId,
  );
  if (acceptedResult.isErr()) {
    return err(acceptedResult.error);
  }
  const acceptedStories = acceptedResult.value;

  const allStoriesResult = await storyRepository.list({
    projectId: input.projectId,
  });
  if (allStoriesResult.isErr()) {
    return err(allStoriesResult.error);
  }

  const assignmentAnchors = allStoriesResult.value
    .map((story) => {
      if (story.status === "Accepted") {
        return {
          storyId: story.id,
          anchorDate: acceptedCompletionDate(story),
        };
      }

      if (!story.iterationId) {
        return null;
      }
      const oldIteration = oldById.get(story.iterationId);
      if (!oldIteration) {
        return null;
      }
      return {
        storyId: story.id,
        anchorDate: oldIteration.startDate,
      };
    })
    .filter((item): item is { storyId: string; anchorDate: string } => {
      return item !== null;
    });

  for (const ov of oldOverrides) {
    const del = await iterationRepository.deleteUtilizationOverride({
      projectId: input.projectId,
      iterationNumber: ov.iterationNumber,
    });
    if (del.isErr()) {
      return err(del.error);
    }
  }

  const deleteAllResult = await iterationRepository.deleteAll(input.projectId);
  if (deleteAllResult.isErr()) {
    return err(deleteAllResult.error);
  }

  const completionDates = acceptedStories.map((s) => {
    return completionDateForRebuild(s);
  });
  const oldIterationStartDates = oldIterations.map((it) => {
    return it.startDate;
  });

  const ranges = buildIterationRangesForRebuild({
    iterationStartDay: input.iterationStartDay,
    sprintDurationDays: input.sprintDurationDays,
    today: input.today,
    completionDates,
    oldIterationStartDates,
  });

  for (const range of ranges) {
    const created = await iterationRepository.create({
      projectId: input.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
    });
    if (created.isErr()) {
      return err(created.error);
    }
  }

  const listResult = await iterationRepository.list(input.projectId);
  if (listResult.isErr()) {
    return err(listResult.error);
  }
  const newIterations = listResult.value;

  for (const anchor of assignmentAnchors) {
    const it = resolveIterationForDate(newIterations, anchor.anchorDate);
    if (!it) {
      continue;
    }
    const assigned = await iterationRepository.assignStory({
      projectId: input.projectId,
      iterationId: it.id,
      storyId: anchor.storyId,
    });
    if (assigned.isErr()) {
      return err(assigned.error);
    }
    if (!assigned.value) {
      return err("ITERATION_REPOSITORY_ERROR");
    }
  }

  for (const ov of oldOverrides) {
    const oldIt = oldByNumber.get(ov.iterationNumber);
    const refStartRaw = ov.iterationStartDate ?? oldIt?.startDate;
    if (!refStartRaw) {
      continue;
    }
    const refDate = toDateOnly(refStartRaw);
    const target = resolveIterationForDate(newIterations, refDate);
    if (!target) {
      continue;
    }
    const updated = await iterationRepository.updateUtilization({
      projectId: input.projectId,
      iterationNumber: target.iterationNumber,
      sprintUtilizationPercent: ov.sprintUtilizationPercent,
    });
    if (updated.isErr()) {
      return err(updated.error);
    }
  }

  return ok(undefined);
}

/**
 * Ensure a DB iteration record exists that contains `today`.
 *
 * - If no iterations exist: create the initial one from project settings.
 * - If the latest iteration already contains today: no-op.
 * - If the latest iteration is in the future: delete future iterations, then
 *   create the initial one from project settings.
 * - If the latest iteration's endDate <= today: create successive iterations
 *   (using the current sprintDurationDays) until today is covered.
 */
export async function ensureCurrentIteration(
  repository: IterationRepository,
  input: {
    projectId: string;
    sprintDurationDays: SprintDuration;
    iterationStartDay: IterationStartDay;
    today: string;
  },
): Promise<Result<Iteration, ManageIterationError>> {
  const latestResult = await repository.findLatest(input.projectId);
  if (latestResult.isErr()) return err(latestResult.error);

  const latest = latestResult.value;

  // No iterations exist — create the initial one
  if (!latest) {
    const { startDate, endDate } = computeInitialIteration(
      input.iterationStartDay,
      input.sprintDurationDays,
      input.today,
    );
    return repository.create({
      projectId: input.projectId,
      startDate,
      endDate,
    });
  }

  // Latest iteration already contains today
  if (latest.startDate <= input.today && latest.endDate > input.today) {
    return ok(latest);
  }

  // Latest iteration is in the future — delete future iterations and recreate
  if (latest.startDate > input.today) {
    await repository.deleteFuture(input.projectId, input.today);
    const { startDate, endDate } = computeInitialIteration(
      input.iterationStartDay,
      input.sprintDurationDays,
      input.today,
    );
    return repository.create({
      projectId: input.projectId,
      startDate,
      endDate,
    });
  }

  // Latest iteration is in the past — create successive iterations
  let cursor = latest.endDate;
  let created = latest;

  while (cursor <= input.today) {
    const nextEnd = addDays(cursor, input.sprintDurationDays);
    const result = await repository.create({
      projectId: input.projectId,
      startDate: cursor,
      endDate: nextEnd,
    });
    if (result.isErr()) return err(result.error);
    created = result.value;
    cursor = nextEnd;
  }

  return ok(created);
}

export async function backfillIncompleteStoriesIntoCurrentIteration(
  iterationRepository: IterationRepository,
  storyRepository: StoryRepository,
  input: {
    projectId: string;
    today: string;
  },
): Promise<Result<number, ManageIterationError>> {
  const iterationsResult = await iterationRepository.list(input.projectId);
  if (iterationsResult.isErr()) return err(iterationsResult.error);

  const current = iterationsResult.value.find(
    (iteration) =>
      iteration.startDate <= input.today && iteration.endDate > input.today,
  );
  if (!current) return ok(0);

  const previous = [...iterationsResult.value]
    .filter((it) => it.endDate <= input.today)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  if (!previous || previous.id === current.id) return ok(0);

  return storyRepository.reassignStoriesAcrossIterations({
    projectId: input.projectId,
    fromIterationId: previous.id,
    toIterationId: current.id,
    statuses: [...CARRY_OVER_STORY_STATUSES] as StoryStatus[],
  });
}

const VELOCITY_LOOKBACK_DAYS = 21;
const DEFAULT_INITIAL_VELOCITY = 10;

function addDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type CalculateVelocityOptions = {
  todayIso?: string;
};

export function calculateVelocity(
  iterations: Iteration[],
  options?: CalculateVelocityOptions,
): number {
  const todayIso = options?.todayIso ?? new Date().toISOString().slice(0, 10);
  const windowStartIso = addDaysIso(todayIso, -VELOCITY_LOOKBACK_DAYS);
  const completed = iterations.filter((it) => {
    return (
      it.endDate < todayIso &&
      it.endDate >= windowStartIso &&
      it.totalPoints > 0
    );
  });

  if (completed.length === 0) {
    // Keep bootstrap behavior for brand-new projects and empty recent window.
    return DEFAULT_INITIAL_VELOCITY;
  }

  const totalPoints = completed.reduce((sum, it) => sum + it.totalPoints, 0);

  return Math.round(totalPoints / completed.length);
}
