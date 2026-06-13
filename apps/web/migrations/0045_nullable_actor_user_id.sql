-- Make actor_user_id nullable in story_timeline_entries and notifications
-- to support account deletion (deleted users' actor IDs are set to NULL while
-- actor_name snapshot is preserved for display).

PRAGMA foreign_keys=OFF;

-- story_timeline_entries: drop NOT NULL on actor_user_id
CREATE TABLE story_timeline_entries_new (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  story_id    TEXT REFERENCES stories(id) ON DELETE SET NULL,
  entry_type  TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name  TEXT NOT NULL,
  action      TEXT,
  field_name  TEXT,
  old_value   TEXT,
  new_value   TEXT,
  body        TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO story_timeline_entries_new SELECT * FROM story_timeline_entries;
DROP TABLE story_timeline_entries;
ALTER TABLE story_timeline_entries_new RENAME TO story_timeline_entries;

-- notifications: drop NOT NULL on actor_user_id
CREATE TABLE notifications_new (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recipient_user_id    TEXT NOT NULL,
  actor_user_id        TEXT,
  actor_name           TEXT NOT NULL,
  story_id             TEXT REFERENCES stories(id) ON DELETE CASCADE,
  story_title_snapshot TEXT,
  invitation_id        TEXT REFERENCES project_invitations(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL,
  message              TEXT NOT NULL,
  source_type          TEXT NOT NULL,
  source_id            TEXT NOT NULL,
  dedupe_key           TEXT NOT NULL,
  read_at              TEXT,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO notifications_new SELECT * FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

PRAGMA foreign_keys=ON;
