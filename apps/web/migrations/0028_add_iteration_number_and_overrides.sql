ALTER TABLE iterations ADD COLUMN iteration_number INTEGER;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY start_date ASC, created_at ASC, id ASC
    ) AS next_number
  FROM iterations
)
UPDATE iterations
SET iteration_number = (
  SELECT numbered.next_number
  FROM numbered
  WHERE numbered.id = iterations.id
);

CREATE UNIQUE INDEX idx_iterations_project_number
ON iterations(project_id, iteration_number);

CREATE TRIGGER trg_iterations_iteration_number_not_null_insert
BEFORE INSERT ON iterations
FOR EACH ROW
WHEN NEW.iteration_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'iterations.iteration_number is required');
END;

CREATE TRIGGER trg_iterations_iteration_number_not_null_update
BEFORE UPDATE ON iterations
FOR EACH ROW
WHEN NEW.iteration_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'iterations.iteration_number is required');
END;

CREATE TABLE iteration_overrides (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  iteration_number INTEGER NOT NULL,
  sprint_utilization_percent INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_iteration_overrides_project_number
ON iteration_overrides(project_id, iteration_number);

CREATE INDEX idx_iteration_overrides_project
ON iteration_overrides(project_id);
