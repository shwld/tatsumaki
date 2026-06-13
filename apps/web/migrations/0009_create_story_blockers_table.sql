CREATE TABLE story_blockers (
  id TEXT PRIMARY KEY,
  blocking_story_id TEXT NOT NULL,
  blocked_story_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (blocking_story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CHECK (blocking_story_id <> blocked_story_id),
  UNIQUE (blocking_story_id, blocked_story_id)
);
