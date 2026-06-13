ALTER TABLE iterations ADD COLUMN burndown_scope_points INTEGER;

CREATE TABLE iteration_daily_snapshots (
  iteration_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  remaining_points INTEGER NOT NULL,
  PRIMARY KEY (iteration_id, snapshot_date),
  FOREIGN KEY (iteration_id) REFERENCES iterations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_iteration_daily_snapshots_iteration
ON iteration_daily_snapshots(iteration_id);
