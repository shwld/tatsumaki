CREATE TABLE object_sweep_cursors (
  scope TEXT PRIMARY KEY,
  start_after TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
