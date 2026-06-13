CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  story_title_snapshot TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('status_changed', 'estimate_changed', 'comment_added', 'mention')),
  message TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('comment', 'story_description')),
  source_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_created
  ON notifications(recipient_user_id, project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_unread
  ON notifications(recipient_user_id, project_id, read_at, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_project_kind_created
  ON notifications(recipient_user_id, project_id, kind, created_at DESC, id DESC);
