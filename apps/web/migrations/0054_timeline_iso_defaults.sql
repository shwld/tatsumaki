-- Timeline timestamps must be ISO-8601 (same as comments) so cursor paging and
-- ordering stay consistent. Rebuild to change the column defaults (SQLite cannot
-- ALTER a default), so a Worker that still omits timestamps during deploy also
-- writes ISO values.

PRAGMA foreign_keys=OFF;

CREATE TABLE story_timeline_entries_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  story_id TEXT REFERENCES stories(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO story_timeline_entries_new
SELECT
  id,
  project_id,
  story_id,
  entry_type,
  actor_user_id,
  actor_name,
  action,
  field_name,
  old_value,
  new_value,
  body,
  CASE WHEN created_at LIKE '%T%Z' THEN created_at
       ELSE strftime('%Y-%m-%dT%H:%M:%fZ', created_at) END,
  CASE WHEN updated_at LIKE '%T%Z' THEN updated_at
       ELSE strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) END
FROM story_timeline_entries;
DROP TABLE story_timeline_entries;
ALTER TABLE story_timeline_entries_new RENAME TO story_timeline_entries;

CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_story_time
  ON story_timeline_entries (story_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_project_story_time
  ON story_timeline_entries (project_id, story_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_project_activity_time
  ON story_timeline_entries (project_id, created_at DESC, id DESC)
  WHERE entry_type = 'activity';
CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_project_comment_time
  ON story_timeline_entries (project_id, created_at DESC, id DESC)
  WHERE entry_type = 'comment';
CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_actor_user_id
  ON story_timeline_entries(actor_user_id);

PRAGMA foreign_keys=ON;
