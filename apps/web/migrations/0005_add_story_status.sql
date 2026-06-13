ALTER TABLE stories ADD COLUMN status TEXT NOT NULL DEFAULT 'Unstarted' CHECK (status IN ('Unstarted', 'Started', 'Finished', 'Delivered', 'Accepted'));
ALTER TABLE stories ADD COLUMN status_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE stories
SET status_changed_at = updated_at
WHERE status_changed_at IS NULL OR status_changed_at = '';
