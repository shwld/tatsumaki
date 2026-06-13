-- Change story_id FK in story_activities to ON DELETE SET NULL and make it
-- nullable so that story deletion succeeds while activity records are preserved.
-- Records for deleted stories have story_id=NULL but retain project_id for
-- project history queries.
CREATE TABLE story_activities_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  story_id TEXT,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
INSERT INTO story_activities_new
  SELECT id, project_id, story_id, actor_user_id, actor_name, action,
         field_name, old_value, new_value, created_at, updated_at
  FROM story_activities;
--> statement-breakpoint
DROP TABLE story_activities;
--> statement-breakpoint
ALTER TABLE story_activities_new RENAME TO story_activities;
