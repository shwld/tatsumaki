ALTER TABLE project_creation_requests ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_creation_requests ADD COLUMN materialize_failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_creation_requests ADD COLUMN payment_evidence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_creation_requests ADD COLUMN next_attempt_at TEXT;
ALTER TABLE project_creation_requests ADD COLUMN last_error TEXT;
ALTER TABLE project_creation_requests ADD COLUMN stalled_reason TEXT CHECK (stalled_reason IN ('abandoned', 'creation_failed', 'entitlement_unconfirmed'));
CREATE INDEX project_creation_requests_recovery_idx ON project_creation_requests (status, stalled_reason, next_attempt_at);
