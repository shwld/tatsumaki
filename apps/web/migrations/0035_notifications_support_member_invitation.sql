ALTER TABLE notifications RENAME TO notifications_old;

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  story_id TEXT REFERENCES stories(id) ON DELETE CASCADE,
  story_title_snapshot TEXT,
  invitation_id TEXT REFERENCES project_invitations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('status_changed', 'estimate_changed', 'comment_added', 'mention', 'member_invitation')),
  message TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('comment', 'story_description', 'invitation')),
  source_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notifications (
  id, project_id, recipient_user_id, actor_user_id, actor_name,
  story_id, story_title_snapshot, invitation_id, kind, message,
  source_type, source_id, dedupe_key, read_at, created_at, updated_at
)
SELECT
  id, project_id, recipient_user_id, actor_user_id, actor_name,
  story_id, story_title_snapshot, NULL, kind, message,
  source_type, source_id, dedupe_key, read_at, created_at, updated_at
FROM notifications_old;

DROP TABLE notifications_old;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_created
  ON notifications(recipient_user_id, project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_unread
  ON notifications(recipient_user_id, project_id, read_at, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_kind_created
  ON notifications(recipient_user_id, project_id, kind, created_at DESC, id DESC);
