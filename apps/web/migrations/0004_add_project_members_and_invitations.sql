CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_invitations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  inviter_user_id TEXT NOT NULL,
  target_user_id TEXT,
  target_email TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TEXT NOT NULL,
  accepted_by_user_id TEXT,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_members_user_id
  ON project_members(user_id);

CREATE INDEX IF NOT EXISTS idx_project_invitations_project_status
  ON project_invitations(project_id, status);
