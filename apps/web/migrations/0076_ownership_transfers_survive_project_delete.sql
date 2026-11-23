-- プロジェクトの削除後も、未完了の返金を再試行できるよう、projects への外部キーを外す。
CREATE TABLE project_ownership_transfers_next (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'declined', 'expired')),
  expires_at TEXT NOT NULL,
  settlement_outcome TEXT CHECK (settlement_outcome IN ('switched', 'not-switched')),
  settlement_status TEXT CHECK (settlement_status IN ('pending', 'settled', 'review')),
  settlement_note TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_user_id <> to_user_id),
  CHECK ((status = 'pending') = (settlement_status IS NULL))
);

INSERT INTO project_ownership_transfers_next (
  id, project_id, from_user_id, to_user_id, status, expires_at,
  settlement_outcome, settlement_status, settlement_note, ended_at, created_at, updated_at
)
SELECT
  id, project_id, from_user_id, to_user_id, status, expires_at,
  settlement_outcome, settlement_status, settlement_note, ended_at, created_at, updated_at
FROM project_ownership_transfers;

DROP TABLE project_ownership_transfers;
ALTER TABLE project_ownership_transfers_next RENAME TO project_ownership_transfers;

CREATE UNIQUE INDEX idx_project_ownership_transfers_one_pending
  ON project_ownership_transfers (project_id) WHERE status = 'pending';

CREATE INDEX idx_project_ownership_transfers_unsettled
  ON project_ownership_transfers (settlement_status) WHERE settlement_status = 'pending';

CREATE INDEX idx_project_ownership_transfers_project
  ON project_ownership_transfers (project_id, created_at);
