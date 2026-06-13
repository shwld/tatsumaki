PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE story_comments_new (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO story_comments_new (
  id,
  story_id,
  user_id,
  actor_name,
  body,
  created_at,
  updated_at
)
SELECT
  id,
  story_id,
  user_id,
  user_id,
  body,
  created_at,
  updated_at
FROM story_comments;
--> statement-breakpoint
DROP TABLE story_comments;
--> statement-breakpoint
ALTER TABLE story_comments_new RENAME TO story_comments;
--> statement-breakpoint
CREATE TABLE story_activities_new (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO story_activities_new (
  id,
  story_id,
  actor_user_id,
  actor_name,
  action,
  field_name,
  old_value,
  new_value,
  created_at,
  updated_at
)
SELECT
  id,
  story_id,
  actor_user_id,
  actor_name,
  action,
  field_name,
  old_value,
  new_value,
  created_at,
  created_at
FROM story_activities;
--> statement-breakpoint
DROP TABLE story_activities;
--> statement-breakpoint
ALTER TABLE story_activities_new RENAME TO story_activities;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
