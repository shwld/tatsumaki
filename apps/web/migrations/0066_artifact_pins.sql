CREATE TABLE artifact_pins (
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pinned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artifact_id, user_id)
);

CREATE INDEX idx_artifact_pins_project_user
  ON artifact_pins(project_id, user_id, pinned_at DESC);
