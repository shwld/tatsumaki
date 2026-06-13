-- Migration number: 0034

ALTER TABLE stories ADD COLUMN completed_at TEXT;

UPDATE stories
SET completed_at = status_changed_at
WHERE status = 'Accepted';
