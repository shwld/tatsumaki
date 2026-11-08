-- Progress aggregation looks up the blockers of each story by blocked_story_id; the unique index starts with blocking_story_id.
CREATE INDEX IF NOT EXISTS idx_story_blockers_blocked_story_id ON story_blockers(blocked_story_id);
