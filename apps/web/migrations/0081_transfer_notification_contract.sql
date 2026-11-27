CREATE TABLE transfer_migration_guard (allowed INTEGER NOT NULL CHECK (allowed = 1));
INSERT INTO transfer_migration_guard (allowed)
  SELECT CASE WHEN EXISTS (SELECT 1 FROM project_ownership_transfers WHERE settlement_status IN ('pending', 'review')) THEN 0 ELSE 1 END;
DROP TABLE transfer_migration_guard;
CREATE TABLE project_ownership_transfers_next (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'declined', 'expired')),
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  outcome_notified INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_user_id <> to_user_id)
);
INSERT INTO project_ownership_transfers_next (id, project_id, from_user_id, to_user_id, status, expires_at, ended_at, outcome_notified, created_at, updated_at)
  SELECT id, project_id, from_user_id, to_user_id, status, expires_at, ended_at, outcome_notified, created_at, updated_at FROM project_ownership_transfers;
DROP TABLE project_ownership_transfers;
ALTER TABLE project_ownership_transfers_next RENAME TO project_ownership_transfers;
CREATE UNIQUE INDEX idx_project_ownership_transfers_one_pending ON project_ownership_transfers(project_id) WHERE status = 'pending';
CREATE INDEX idx_project_ownership_transfers_project ON project_ownership_transfers(project_id, created_at);
CREATE INDEX project_transfer_outcomes_pending ON project_ownership_transfers(outcome_notified, ended_at);

CREATE TRIGGER project_delete_closes_transfers AFTER DELETE ON projects
BEGIN
  UPDATE project_ownership_transfers
  SET status = 'cancelled', outcome_notified = 0,
      ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE project_id = OLD.id AND status = 'pending';
END;
