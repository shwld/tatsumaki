-- Contract (ADR-0013): saved filters reference labels only, and an epic's stories and name come from its label.
-- Epic conditions that cannot become a label condition are removed and listed in the report table.
-- A filter that already has label conditions keeps them: label and epic conditions were ANDed, and one label list cannot express that.
CREATE TABLE saved_filter_epic_conversion_report (
  saved_filter_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  epic_id TEXT NOT NULL,
  PRIMARY KEY (saved_filter_id, epic_id)
);

INSERT OR IGNORE INTO saved_filter_epic_conversion_report (saved_filter_id, project_id, epic_id)
SELECT sf.id, sf.project_id, je.value
FROM saved_filters sf, json_each(sf.filters, '$.epicIds') je
WHERE json_valid(sf.filters)
  AND json_type(sf.filters, '$.epicIds') = 'array'
  AND (
    json_array_length(coalesce(json_extract(sf.filters, '$.labelIds'), '[]')) > 0
    OR NOT EXISTS (
      SELECT 1 FROM epics e
      WHERE e.id = je.value AND e.project_id = sf.project_id AND e.label_id IS NOT NULL
    )
  );

UPDATE saved_filters
SET filters = json_remove(
  json_set(
    filters,
    '$.labelIds',
    json(CASE
      WHEN json_array_length(coalesce(json_extract(filters, '$.labelIds'), '[]')) > 0
        THEN json_extract(filters, '$.labelIds')
      ELSE (
        SELECT coalesce(json_group_array(DISTINCT label_id), '[]')
        FROM (
          SELECT e.label_id AS label_id
          FROM json_each(saved_filters.filters, '$.epicIds') je
          JOIN epics e ON e.id = je.value AND e.project_id = saved_filters.project_id
          WHERE e.label_id IS NOT NULL
        )
      )
    END)
  ),
  '$.epicIds'
)
WHERE json_valid(filters) AND json_type(filters, '$.epicIds') = 'array';

DROP INDEX IF EXISTS idx_stories_epic_id;
DROP INDEX IF EXISTS idx_stories_project_epic_position;
ALTER TABLE stories DROP COLUMN epic_id;
ALTER TABLE epics DROP COLUMN name;
