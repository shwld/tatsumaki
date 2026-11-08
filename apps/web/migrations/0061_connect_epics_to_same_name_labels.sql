-- Backfill: connect every existing epic to the label with its name and give that label to the epic's stories (ADR-0013 Data migration step 3).
-- Before applying it to a deployed database, run the read-only preview in docs/epic-label-connection-preview.md and rename same-named labels that mean something else.
INSERT OR IGNORE INTO project_labels (id, project_id, name, color, created_at, updated_at)
SELECT lower(hex(randomblob(16))), e.project_id, trim(e.name), '#6b7280', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM epics e
WHERE e.label_id IS NULL AND trim(e.name) <> '';

UPDATE epics
SET
  label_id = (
    SELECT pl.id FROM project_labels pl
    WHERE pl.project_id = epics.project_id AND pl.name = trim(epics.name)
  ),
  enabled = 1,
  position = (
    SELECT count(*) FROM epics other
    WHERE other.project_id = epics.project_id
      AND (other.name < epics.name OR (other.name = epics.name AND other.id <= epics.id))
  )
WHERE label_id IS NULL;

INSERT OR IGNORE INTO story_labels (project_id, story_id, label_id)
SELECT s.project_id, s.id, e.label_id
FROM stories s
JOIN epics e ON e.id = s.epic_id AND e.project_id = s.project_id
WHERE e.label_id IS NOT NULL;
