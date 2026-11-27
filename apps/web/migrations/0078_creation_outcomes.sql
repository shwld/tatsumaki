ALTER TABLE project_creation_requests ADD COLUMN outcome_notified INTEGER NOT NULL DEFAULT 1;
ALTER TABLE project_creation_requests ADD COLUMN outcome_at TEXT;
UPDATE project_creation_requests SET outcome_notified = 0, outcome_at = updated_at
WHERE status = 'pending' AND stalled_reason IS NOT NULL;
CREATE INDEX project_creation_outcomes_pending ON project_creation_requests(outcome_notified, outcome_at);
