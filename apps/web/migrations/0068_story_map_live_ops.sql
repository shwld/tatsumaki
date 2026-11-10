-- seq counts the operations applied to the map by its Durable Object.
ALTER TABLE story_maps ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;

-- Idempotency record of applied commands. A resent op_id from the same user is
-- answered from this row instead of being applied twice.
CREATE TABLE story_map_ops (
  map_id TEXT NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  op_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (map_id, op_id)
);

CREATE INDEX idx_story_map_ops_created ON story_map_ops(map_id, created_at);
