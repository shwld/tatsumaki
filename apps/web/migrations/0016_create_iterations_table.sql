-- Migration number: 0016 	 2026-04-04T06:21:50.544Z

CREATE TABLE IF NOT EXISTS iterations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_iterations_project_id ON iterations(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_iterations_project_date ON iterations(project_id, start_date);

ALTER TABLE stories ADD COLUMN iteration_id TEXT REFERENCES iterations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stories_iteration_id ON stories(iteration_id);
