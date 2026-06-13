-- Migration 0045 dropped the UNIQUE constraint on notifications.dedupe_key
-- and the indexes when recreating the table. This migration restores them.

PRAGMA foreign_keys=OFF;

CREATE TABLE notifications_new2 (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recipient_user_id    TEXT NOT NULL,
  actor_user_id        TEXT,
  actor_name           TEXT NOT NULL,
  story_id             TEXT REFERENCES stories(id) ON DELETE CASCADE,
  story_title_snapshot TEXT,
  invitation_id        TEXT REFERENCES project_invitations(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL CHECK (kind IN ('status_changed', 'estimate_changed', 'comment_added', 'mention', 'member_invitation', 'story_activity')),
  message              TEXT NOT NULL,
  source_type          TEXT NOT NULL CHECK (source_type IN ('comment', 'story_description', 'invitation', 'story_activity')),
  source_id            TEXT NOT NULL,
  dedupe_key           TEXT NOT NULL UNIQUE,
  read_at              TEXT,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notifications_new2 SELECT * FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new2 RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_created
  ON notifications(recipient_user_id, project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_unread
  ON notifications(recipient_user_id, project_id, read_at, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_kind_created
  ON notifications(recipient_user_id, project_id, kind, created_at DESC, id DESC);

-- Restore story_timeline_entries indexes that may have been dropped by migration 0045
CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_story_time
  ON story_timeline_entries (story_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_project_story_time
  ON story_timeline_entries (project_id, story_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_project_activity_time
  ON story_timeline_entries (project_id, created_at DESC, id DESC)
  WHERE entry_type = 'activity';

PRAGMA foreign_keys=ON;
