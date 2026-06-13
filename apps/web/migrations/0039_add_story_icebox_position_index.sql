-- Speeds up Icebox head-insert update:
-- update stories set position = position + 1
-- where project_id = ? and is_icebox = 1
CREATE INDEX IF NOT EXISTS idx_stories_project_icebox_position
ON stories(project_id, is_icebox, position);
