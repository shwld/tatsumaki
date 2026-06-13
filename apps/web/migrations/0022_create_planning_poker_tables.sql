CREATE TABLE planning_poker_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Revealed', 'Closed')),
  consensus_point INTEGER,
  created_by TEXT NOT NULL,
  revealed_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_planning_poker_sessions_project_status
  ON planning_poker_sessions(project_id, status, created_at DESC);

CREATE INDEX idx_planning_poker_sessions_story
  ON planning_poker_sessions(story_id, status, created_at DESC);

CREATE TABLE planning_poker_votes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES planning_poker_sessions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  point INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, user_id)
);

CREATE INDEX idx_planning_poker_votes_session
  ON planning_poker_votes(session_id, updated_at DESC);
