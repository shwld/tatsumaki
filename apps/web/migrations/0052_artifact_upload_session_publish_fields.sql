-- finalize creates artifacts / artifact_versions rows from the session alone,
-- so the session must carry the title and entrypoint chosen at creation time.
ALTER TABLE artifact_upload_sessions ADD COLUMN entrypoint TEXT NOT NULL DEFAULT '';
ALTER TABLE artifact_upload_sessions ADD COLUMN title TEXT NOT NULL DEFAULT '';

-- Ties a version to the session that created it so publish can tell its own
-- insert from one made by a concurrent session.
ALTER TABLE artifact_versions ADD COLUMN session_id TEXT;
