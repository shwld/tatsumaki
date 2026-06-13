-- Migration: Add indexes to support advanced story search filters efficiently
-- These cover the new multi-condition filters: type, epicId, and ownerIds

-- Composite index for type filter with project scope and position ordering
CREATE INDEX IF NOT EXISTS idx_stories_project_type_position ON stories(project_id, type, position);

-- Composite index for epic filter with project scope and position ordering
-- (Replaces/supplements single-column idx_stories_epic_id from migration 0014)
CREATE INDEX IF NOT EXISTS idx_stories_project_epic_position ON stories(project_id, epic_id, position);

-- Composite index for correlated EXISTS subquery on story_owners (ownerIds filter)
-- Allows "user_id IN (...) AND story_id = stories.id" to use a covering index
CREATE INDEX IF NOT EXISTS idx_story_owners_user_story ON story_owners(user_id, story_id);
