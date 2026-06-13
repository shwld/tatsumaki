-- Per-day committed scope for burndown ideal line (review follow-up).
-- Legacy rows only had remaining_points; backfill scope with remaining as best-effort.
ALTER TABLE iteration_daily_snapshots ADD COLUMN scope_points INTEGER NOT NULL DEFAULT 0;

UPDATE iteration_daily_snapshots SET scope_points = remaining_points;
