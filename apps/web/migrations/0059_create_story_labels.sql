-- Expand: story label membership by label ID (ADR-0013). stories.labels stays as the rollback path until the contract migration.
CREATE UNIQUE INDEX idx_project_labels_id_project ON project_labels(id, project_id);
CREATE UNIQUE INDEX idx_stories_id_project ON stories(id, project_id);

CREATE TABLE story_labels (
  project_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (story_id, label_id),
  FOREIGN KEY (story_id, project_id) REFERENCES stories(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (label_id, project_id) REFERENCES project_labels(id, project_id) ON DELETE CASCADE
);

CREATE INDEX idx_story_labels_label ON story_labels(label_id);

INSERT OR IGNORE INTO project_labels (id, project_id, name, color, created_at, updated_at)
SELECT lower(hex(randomblob(16))), s.project_id, trim(je.value), '#6b7280', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM stories s, json_each(s.labels) je
WHERE je.type = 'text' AND trim(je.value) <> ''
GROUP BY s.project_id, trim(je.value);

INSERT OR IGNORE INTO story_labels (project_id, story_id, label_id)
SELECT s.project_id, s.id, pl.id
FROM stories s, json_each(s.labels) je
JOIN project_labels pl ON pl.project_id = s.project_id AND pl.name = trim(je.value)
WHERE je.type = 'text';
