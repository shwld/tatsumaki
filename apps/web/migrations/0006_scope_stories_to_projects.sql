PRAGMA foreign_keys=OFF;

INSERT INTO projects (id, name, sprint_duration_days, created_at, updated_at)
SELECT
  'migrated-project',
  'Migrated Stories',
  14,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM projects);

CREATE TABLE stories_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'feature' CHECK (type IN ('feature', 'bug', 'chore')),
  status TEXT NOT NULL DEFAULT 'Unstarted' CHECK (status IN ('Unstarted', 'Started', 'Finished', 'Delivered', 'Accepted')),
  status_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  story_point INTEGER CHECK (story_point IN (0, 1, 2, 3, 5, 8) OR story_point IS NULL),
  labels TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO stories_new (
  id,
  project_id,
  title,
  description,
  type,
  status,
  status_changed_at,
  story_point,
  labels,
  position,
  created_at,
  updated_at
)
SELECT
  s.id,
  COALESCE(
    (SELECT p.id FROM projects p ORDER BY p.created_at ASC, p.id ASC LIMIT 1),
    'migrated-project'
  ),
  s.title,
  s.description,
  s.type,
  COALESCE(s.status, 'Unstarted'),
  COALESCE(NULLIF(s.status_changed_at, ''), s.updated_at, CURRENT_TIMESTAMP),
  s.story_point,
  COALESCE(NULLIF(s.labels, ''), '[]'),
  s.position,
  s.created_at,
  s.updated_at
FROM stories s;

DROP TABLE stories;
ALTER TABLE stories_new RENAME TO stories;

CREATE INDEX idx_stories_project_position ON stories(project_id, position);

PRAGMA foreign_keys=ON;
