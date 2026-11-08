-- Backfill: saved filters reference labels by ID (ADR-0013). Names that match no label of the project are dropped from the filter and listed in the report table.
CREATE TABLE saved_filter_label_conversion_report (
  saved_filter_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  label_name TEXT NOT NULL,
  PRIMARY KEY (saved_filter_id, label_name)
);

INSERT OR IGNORE INTO saved_filter_label_conversion_report (saved_filter_id, project_id, label_name)
SELECT sf.id, sf.project_id, je.value
FROM saved_filters sf, json_each(sf.filters, '$.labels') je
WHERE json_valid(sf.filters)
  AND json_type(sf.filters, '$.labels') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM project_labels pl
    WHERE pl.project_id = sf.project_id AND pl.name = je.value
  );

UPDATE saved_filters
SET filters = json_remove(
  json_set(
    filters,
    '$.labelIds',
    json((
      SELECT coalesce(json_group_array(pl.id), '[]')
      FROM json_each(saved_filters.filters, '$.labels') je
      JOIN project_labels pl ON pl.project_id = saved_filters.project_id AND pl.name = je.value
    ))
  ),
  '$.labels'
)
WHERE json_valid(filters) AND json_type(filters, '$.labels') = 'array';
