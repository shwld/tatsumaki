CREATE TABLE story_maps (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  achievement_goal TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_story_maps_project ON story_maps(project_id, archived_at, created_at);

CREATE TABLE story_map_personas (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX idx_story_map_personas_map ON story_map_personas(map_id, position);

CREATE TABLE story_map_activities (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX idx_story_map_activities_map ON story_map_activities(map_id, position);

CREATE TABLE story_map_tasks (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES story_map_activities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX idx_story_map_tasks_activity ON story_map_tasks(activity_id, position);
CREATE INDEX idx_story_map_tasks_map ON story_map_tasks(map_id);

CREATE TABLE story_map_slices (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX idx_story_map_slices_map ON story_map_slices(map_id, position);

-- story_id has no foreign key on purpose: when the story is deleted the card
-- keeps the id so it reads as "missing" instead of turning into an idea.
-- slice_id NULL is the unplanned row.
CREATE TABLE story_map_cards (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES story_map_tasks(id) ON DELETE CASCADE,
  slice_id TEXT REFERENCES story_map_slices(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  idea_title TEXT,
  note TEXT NOT NULL DEFAULT '',
  story_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_story_map_cards_cell ON story_map_cards(task_id, slice_id, position);
CREATE INDEX idx_story_map_cards_map ON story_map_cards(map_id);
CREATE UNIQUE INDEX idx_story_map_cards_story
  ON story_map_cards(map_id, story_id) WHERE story_id IS NOT NULL;
