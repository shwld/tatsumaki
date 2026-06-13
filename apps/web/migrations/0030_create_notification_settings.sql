CREATE TABLE IF NOT EXISTS notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_enabled IN (0, 1)),
  target_scope TEXT NOT NULL DEFAULT 'assigned_only' CHECK (target_scope IN ('assigned_only', 'all_stories')),
  notify_on_status_changed INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_status_changed IN (0, 1)),
  notify_on_comment INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_comment IN (0, 1)),
  notify_on_estimate INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_estimate IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
