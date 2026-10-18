CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  archived_at TEXT,
  latest_version INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_artifacts_project_updated
  ON artifacts(project_id, archived_at, updated_at DESC);

CREATE TABLE artifact_versions (
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  entrypoint TEXT NOT NULL,
  tree_digest TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  total_bytes INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artifact_id, version)
);

CREATE TABLE artifact_files (
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  content_type TEXT NOT NULL,
  PRIMARY KEY (artifact_id, version, path),
  FOREIGN KEY (artifact_id, version)
    REFERENCES artifact_versions(artifact_id, version) ON DELETE CASCADE
);

CREATE INDEX idx_artifact_files_sha256 ON artifact_files(sha256);

-- artifact_id is assigned when the session is created, before the artifacts
-- row exists, so it intentionally has no FK to artifacts (ADR-0010 §6).
CREATE TABLE artifact_upload_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL,
  base_version INTEGER,
  tree_digest TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'expired')),
  idempotency_key TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, created_by, idempotency_key)
);

CREATE INDEX idx_artifact_upload_sessions_expires
  ON artifact_upload_sessions(status, expires_at);

CREATE TABLE artifact_upload_session_files (
  session_id TEXT NOT NULL REFERENCES artifact_upload_sessions(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, path)
);
