-- Enforce DB-level NOT NULL for stories.story_number.
-- 0037 introduced story_number + unique index, but SQLite ADD COLUMN couldn't attach NOT NULL.
-- Recreate stories table with the final schema and copy data safely.

PRAGMA foreign_keys = OFF;

CREATE TABLE stories_new (
  id TEXT PRIMARY KEY,
  story_number INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'feature' CHECK (type IN ('feature', 'bug', 'chore', 'release')),
  status TEXT NOT NULL DEFAULT 'Unstarted' CHECK (status IN ('Unstarted', 'Started', 'Finished', 'Delivered', 'Accepted', 'Rejected')),
  status_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  story_point INTEGER CHECK (story_point IN (0, 1, 2, 3, 5, 8) OR story_point IS NULL),
  labels TEXT NOT NULL DEFAULT '[]',
  requester_id TEXT,
  epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
  iteration_id TEXT REFERENCES iterations(id) ON DELETE SET NULL,
  release_date TEXT,
  is_icebox INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

WITH numbered AS (
  SELECT
    id,
    COALESCE(
      story_number,
      ROW_NUMBER() OVER (
        PARTITION BY project_id
        ORDER BY created_at ASC, id ASC
      )
    ) AS normalized_story_number
  FROM stories
)
INSERT INTO stories_new (
  id,
  story_number,
  project_id,
  title,
  description,
  type,
  status,
  status_changed_at,
  completed_at,
  story_point,
  labels,
  requester_id,
  epic_id,
  iteration_id,
  release_date,
  is_icebox,
  position,
  created_at,
  updated_at
)
SELECT
  s.id,
  n.normalized_story_number,
  s.project_id,
  s.title,
  s.description,
  s.type,
  s.status,
  s.status_changed_at,
  s.completed_at,
  s.story_point,
  s.labels,
  s.requester_id,
  s.epic_id,
  s.iteration_id,
  s.release_date,
  s.is_icebox,
  s.position,
  s.created_at,
  s.updated_at
FROM stories s
JOIN numbered n ON n.id = s.id;

DROP TABLE stories;
ALTER TABLE stories_new RENAME TO stories;

CREATE INDEX IF NOT EXISTS idx_stories_project_position ON stories(project_id, position);
CREATE INDEX IF NOT EXISTS idx_stories_epic_id ON stories(epic_id);
CREATE INDEX IF NOT EXISTS idx_stories_iteration_id ON stories(iteration_id);
CREATE INDEX IF NOT EXISTS stories_requester_id_idx ON stories(requester_id);
CREATE INDEX IF NOT EXISTS idx_stories_project_type_position ON stories(project_id, type, position);
CREATE INDEX IF NOT EXISTS idx_stories_project_epic_position ON stories(project_id, epic_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS stories_project_id_story_number_idx ON stories(project_id, story_number);

PRAGMA foreign_keys = ON;
