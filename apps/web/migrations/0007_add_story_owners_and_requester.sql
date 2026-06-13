PRAGMA foreign_keys = ON;

ALTER TABLE stories ADD COLUMN requester_id TEXT;

CREATE TABLE IF NOT EXISTS story_owners (
  story_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (story_id, user_id),
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS story_owners_story_id_idx ON story_owners (story_id);
CREATE INDEX IF NOT EXISTS story_owners_user_id_idx ON story_owners (user_id);
CREATE INDEX IF NOT EXISTS stories_requester_id_idx ON stories (requester_id);
