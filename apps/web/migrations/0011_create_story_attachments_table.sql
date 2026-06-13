-- Migration: Create story_attachments table for storing story attachment metadata
CREATE TABLE story_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_story_attachments_story_created_at
  ON story_attachments(story_id, created_at DESC);

CREATE UNIQUE INDEX idx_story_attachments_file_key
  ON story_attachments(file_key);
