ALTER TABLE project_ownership_transfers ADD COLUMN outcome_notified INTEGER NOT NULL DEFAULT 1;
CREATE INDEX project_transfer_outcomes_pending ON project_ownership_transfers(outcome_notified, ended_at);
