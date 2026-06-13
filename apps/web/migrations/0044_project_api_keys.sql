CREATE TABLE project_api_keys (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  key_prefix    TEXT NOT NULL,
  scopes        TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  TEXT,
  revoked_at    TEXT
);

CREATE INDEX idx_project_api_keys_project ON project_api_keys(project_id);
