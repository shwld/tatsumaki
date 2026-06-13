-- Ensure project deletion cascades to story_timeline_entries to avoid
-- foreign-key violations when deleting a project.

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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO story_timeline_entries_new SELECT * FROM story_timeline_entries;
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
