-- Partial index for project-scoped comment queries (mirrors activity index in 0032).
CREATE INDEX idx_story_timeline_entries_project_comment_time
  ON story_timeline_entries (project_id, created_at DESC, id DESC)
  WHERE entry_type = 'comment';
