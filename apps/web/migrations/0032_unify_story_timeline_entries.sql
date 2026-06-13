-- Unified story timeline: activities + comments in one table (big-bang migration).
-- Replaces story_activities and story_comments.

CREATE TABLE story_timeline_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  story_id TEXT,
  entry_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL,
  CHECK (entry_type IN ('activity', 'comment'))
);
--> statement-breakpoint
INSERT INTO story_timeline_entries (
  id,
  project_id,
  story_id,
  entry_type,
  actor_user_id,
  actor_name,
  action,
  field_name,
  old_value,
  new_value,
  body,
  created_at,
  updated_at
)
SELECT
  id,
  project_id,
  story_id,
  'activity',
  actor_user_id,
  actor_name,
  action,
  field_name,
  old_value,
  new_value,
  NULL,
  created_at,
  updated_at
FROM story_activities;
--> statement-breakpoint
INSERT INTO story_timeline_entries (
  id,
  project_id,
  story_id,
  entry_type,
  actor_user_id,
  actor_name,
  action,
  field_name,
  old_value,
  new_value,
  body,
  created_at,
  updated_at
)
SELECT
  sc.id,
  s.project_id,
  sc.story_id,
  'comment',
  sc.user_id,
  sc.actor_name,
  NULL,
  NULL,
  NULL,
  NULL,
  sc.body,
  sc.created_at,
  sc.updated_at
FROM story_comments sc
INNER JOIN stories s ON sc.story_id = s.id;
--> statement-breakpoint
CREATE INDEX idx_story_timeline_entries_story_time
  ON story_timeline_entries (story_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX idx_story_timeline_entries_project_story_time
  ON story_timeline_entries (project_id, story_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX idx_story_timeline_entries_project_activity_time
  ON story_timeline_entries (project_id, created_at DESC, id DESC)
  WHERE entry_type = 'activity';
--> statement-breakpoint
DROP TABLE story_comments;
--> statement-breakpoint
DROP TABLE story_activities;
