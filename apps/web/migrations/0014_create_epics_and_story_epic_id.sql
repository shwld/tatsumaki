CREATE TABLE IF NOT EXISTS epics (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_epics_project_id ON epics(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_epics_project_id_name
  ON epics(project_id, name);

ALTER TABLE stories ADD COLUMN epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stories_epic_id ON stories(epic_id);
