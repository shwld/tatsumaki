import {
  and,
  asc,
  eq,
  gt,
  inArray,
  lte,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { createDb, type DbClient } from "../../infrastructure/db/client";
import { iterationDailySnapshotsTable } from "../../infrastructure/db/schema/iteration-daily-snapshots";
import { iterationsTable } from "../../infrastructure/db/schema/iterations";
import { storiesTable } from "../../infrastructure/db/schema/stories";

export type BurndownDayPoint = {
  date: string;
  idealRemaining: number;
  actualRemaining: number | null;
  scopeTotalPoints: number;
};

export type BurndownChartPayload = {
  iterationId: string;
  startDate: string;
  endDate: string;
  burndownScopePoints: number;
  days: BurndownDayPoint[];
};

type BurndownError = "iteration_not_found" | "burndown_load_failed";

function utcDayFromTimestamp(iso: string): string {
  return iso.slice(0, 10);
}

function parseUtcDayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function idealRemainingForDay(
  scope: number,
  startDate: string,
  endDate: string,
  day: string,
): number {
  const startMs = parseUtcDayStartMs(startDate);
  const endMs = parseUtcDayStartMs(endDate);
  const dayMs = parseUtcDayStartMs(day);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || Number.isNaN(dayMs)) {
    return 0;
  }
  if (dayMs <= startMs) {
    return scope;
  }
  if (dayMs >= endMs) {
    return 0;
  }
  const span = endMs - startMs;
  if (span <= 0) {
    return 0;
  }
  const t = (dayMs - startMs) / span;
  return Math.max(0, scope * (1 - t));
}

export function listIterationUtcDatesHalfOpen(
  iterationStartDate: string,
  iterationEndExclusiveDate: string,
): string[] {
  const dates: string[] = [];
  const startMs = parseUtcDayStartMs(iterationStartDate);
  const endExclusiveMs = parseUtcDayStartMs(iterationEndExclusiveDate);
  if (Number.isNaN(startMs) || Number.isNaN(endExclusiveMs)) {
    return dates;
  }
  let cursorMs = startMs;
  while (cursorMs < endExclusiveMs) {
    dates.push(new Date(cursorMs).toISOString().slice(0, 10));
    cursorMs += 86_400_000;
    if (dates.length > 400) {
      break;
    }
  }
  return dates;
}

async function sumCommittedScopeForIteration(
  db: DbClient,
  iterationId: string,
): Promise<number> {
  const row = await db
    .select({
      total: sql<number>`coalesce(sum(${storiesTable.storyPoint}), 0)`.as(
        "total",
      ),
    })
    .from(storiesTable)
    .where(
      and(
        eq(storiesTable.iterationId, iterationId),
        ne(storiesTable.status, "Rejected"),
      ),
    )
    .get();
  return row?.total ?? 0;
}

async function listIterationPointAggregates(
  db: DbClient,
  iterationIds: string[],
): Promise<Map<string, { scopePoints: number; remainingPoints: number }>> {
  if (iterationIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      iterationId: storiesTable.iterationId,
      scopePoints:
        sql<number>`coalesce(sum(case when ${storiesTable.status} != 'Rejected' then ${storiesTable.storyPoint} else 0 end), 0)`.as(
          "scope_points",
        ),
      remainingPoints:
        sql<number>`coalesce(sum(case when ${storiesTable.status} not in ('Accepted', 'Rejected') then ${storiesTable.storyPoint} else 0 end), 0)`.as(
          "remaining_points",
        ),
    })
    .from(storiesTable)
    .where(inArray(storiesTable.iterationId, iterationIds))
    .groupBy(storiesTable.iterationId)
    .all();

  return new Map(
    rows
      .filter(
        (row): row is typeof row & { iterationId: string } => !!row.iterationId,
      )
      .map((row) => [
        row.iterationId,
        {
          scopePoints: row.scopePoints ?? 0,
          remainingPoints: row.remainingPoints ?? 0,
        },
      ]),
  );
}

async function sumRemainingForIteration(
  db: DbClient,
  iterationId: string,
): Promise<number> {
  const row = await db
    .select({
      total: sql<number>`coalesce(sum(${storiesTable.storyPoint}), 0)`.as(
        "total",
      ),
    })
    .from(storiesTable)
    .where(
      and(
        eq(storiesTable.iterationId, iterationId),
        notInArray(storiesTable.status, ["Accepted", "Rejected"]),
      ),
    )
    .get();
  return row?.total ?? 0;
}

export async function recordBurndownSnapshotForIterations(
  d1: D1Database,
  iterationRows: readonly { id: string }[],
  todayUtcDate: string,
): Promise<Result<void, BurndownError>> {
  if (iterationRows.length === 0) {
    return ok(undefined);
  }

  try {
    const db = createDb(d1);

    const ids = iterationRows.map((r) => r.id);
    const iterations = await db
      .select()
      .from(iterationsTable)
      .where(inArray(iterationsTable.id, ids))
      .all();
    const aggregates = await listIterationPointAggregates(db, ids);

    for (const iteration of iterations) {
      if (
        iteration.startDate > todayUtcDate ||
        iteration.endDate <= todayUtcDate
      ) {
        continue;
      }

      const aggregate = aggregates.get(iteration.id);
      const remaining = aggregate?.remainingPoints ?? 0;
      const scope = aggregate?.scopePoints ?? 0;

      await db
        .insert(iterationDailySnapshotsTable)
        .values({
          iterationId: iteration.id,
          snapshotDate: todayUtcDate,
          scopePoints: scope,
          remainingPoints: remaining,
        })
        .onConflictDoUpdate({
          target: [
            iterationDailySnapshotsTable.iterationId,
            iterationDailySnapshotsTable.snapshotDate,
          ],
          set: {
            scopePoints: scope,
            remainingPoints: remaining,
          },
        });
    }

    return ok(undefined);
  } catch {
    return err("burndown_load_failed");
  }
}

export async function ensureIterationBurndownSnapshotToday(
  d1: D1Database,
  projectId: string,
  iterationId: string,
): Promise<Result<void, BurndownError>> {
  try {
    const db = createDb(d1);
    const row = await db
      .select()
      .from(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, projectId),
          eq(iterationsTable.id, iterationId),
        ),
      )
      .get();

    if (!row) {
      return err("iteration_not_found");
    }

    const todayUtcDate = utcDayFromTimestamp(new Date().toISOString());
    if (row.startDate > todayUtcDate || row.endDate <= todayUtcDate) {
      return ok(undefined);
    }

    const snapshotResult = await recordBurndownSnapshotForIterations(
      d1,
      [{ id: row.id }],
      todayUtcDate,
    );
    if (snapshotResult.isErr()) {
      return err(snapshotResult.error);
    }
    return ok(undefined);
  } catch {
    return err("burndown_load_failed");
  }
}

export async function getBurndownChartPayload(
  d1: D1Database,
  projectId: string,
  iterationId: string,
): Promise<Result<BurndownChartPayload, BurndownError>> {
  try {
    const db = createDb(d1);
    const row = await db
      .select()
      .from(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, projectId),
          eq(iterationsTable.id, iterationId),
        ),
      )
      .get();

    if (!row) {
      return err("iteration_not_found");
    }

    const todayUtcDate = utcDayFromTimestamp(new Date().toISOString());
    if (row.startDate > todayUtcDate || row.endDate <= todayUtcDate) {
      return err("iteration_not_found");
    }

    const liveScope = await sumCommittedScopeForIteration(db, iterationId);
    const liveRemaining = await sumRemainingForIteration(db, iterationId);

    const fallbackScope = Math.max(liveScope, liveRemaining);

    const snaps = await db
      .select()
      .from(iterationDailySnapshotsTable)
      .where(eq(iterationDailySnapshotsTable.iterationId, iterationId))
      .orderBy(asc(iterationDailySnapshotsTable.snapshotDate))
      .all();

    const byDate = new Map(
      snaps.map((s) => [
        s.snapshotDate,
        {
          scopePoints: s.scopePoints,
          remainingPoints: s.remainingPoints,
        },
      ]),
    );

    const sprintDatesFull = listIterationUtcDatesHalfOpen(
      row.startDate,
      row.endDate,
    );

    let runningRemaining = fallbackScope;
    let runningScope = fallbackScope;

    const days: BurndownDayPoint[] = sprintDatesFull.map((day) => {
      let actualRemaining: number | null;
      let idealScope = runningScope;

      if (day >= todayUtcDate) {
        idealScope = liveScope;
      } else {
        const snapScope = byDate.get(day)?.scopePoints;
        if (snapScope !== undefined) {
          runningScope = snapScope;
          idealScope = snapScope;
        }
      }

      if (day > todayUtcDate) {
        actualRemaining = null;
      } else {
        const snapRemaining = byDate.get(day)?.remainingPoints;
        if (snapRemaining !== undefined) {
          runningRemaining = snapRemaining;
        }

        actualRemaining =
          day === todayUtcDate ? liveRemaining : runningRemaining;

        if (day === todayUtcDate) {
          runningRemaining = liveRemaining;
        }
      }

      return {
        date: day,
        idealRemaining: idealRemainingForDay(
          Math.max(idealScope, 0),
          row.startDate,
          row.endDate,
          day,
        ),
        actualRemaining,
        scopeTotalPoints: Math.max(idealScope, 0),
      };
    });

    return ok({
      iterationId,
      startDate: row.startDate,
      endDate: row.endDate,
      burndownScopePoints: liveScope,
      days,
    });
  } catch {
    return err("burndown_load_failed");
  }
}

export async function recordBurndownSnapshotsAllActiveIterations(
  d1: D1Database,
): Promise<Result<{ activeIterationCount: number }, BurndownError>> {
  try {
    const db = createDb(d1);
    const todayUtcDate = utcDayFromTimestamp(new Date().toISOString());
    const rows = await db
      .select({ id: iterationsTable.id })
      .from(iterationsTable)
      .where(
        and(
          lte(iterationsTable.startDate, todayUtcDate),
          gt(iterationsTable.endDate, todayUtcDate),
        ),
      )
      .all();

    const snapshotResult = await recordBurndownSnapshotForIterations(
      d1,
      rows,
      todayUtcDate,
    );
    if (snapshotResult.isErr()) {
      return err(snapshotResult.error);
    }
    return ok({ activeIterationCount: rows.length });
  } catch {
    return err("burndown_load_failed");
  }
}
