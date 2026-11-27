CREATE TABLE project_name_notifications (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  revision INTEGER NOT NULL,
  notified_revision INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT NOT NULL DEFAULT ''
);
INSERT INTO project_name_notifications (project_id, name, revision)
  SELECT id, name, 1 FROM projects;
CREATE TRIGGER project_name_changed AFTER UPDATE OF name ON projects
WHEN NEW.name != OLD.name
BEGIN
  INSERT INTO project_name_notifications (project_id, name, revision, notified_revision)
  VALUES (NEW.id, NEW.name, 1, 0)
  ON CONFLICT(project_id) DO UPDATE SET name = excluded.name, revision = revision + 1;
END;
