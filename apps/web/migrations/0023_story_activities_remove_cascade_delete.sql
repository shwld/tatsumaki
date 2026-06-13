-- Add project_id to story_activities and remove ON DELETE CASCADE so that
-- activity records (including 'created' and 'deleted' events) persist after
-- a story is deleted. This preserves project history even for deleted stories.
-- SQLite does not support ALTER COLUMN, so we recreate the table.
CREATE TABLE story_activities_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  story_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (story_id) REFERENCES stories(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
INSERT INTO story_activities_new
  SELECT sa.id, COALESCE(s.project_id, ''), sa.story_id, sa.actor_user_id,
         sa.actor_name, sa.action, sa.field_name, sa.old_value, sa.new_value,
         sa.created_at, sa.updated_at
  FROM story_activities sa
  LEFT JOIN stories s ON sa.story_id = s.id;
--> statement-breakpoint
DROP TABLE story_activities;
--> statement-breakpoint
ALTER TABLE story_activities_new RENAME TO story_activities;
