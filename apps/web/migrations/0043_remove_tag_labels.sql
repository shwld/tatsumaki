UPDATE stories
SET labels = COALESCE(
  (
    SELECT json_group_array(value)
    FROM (
      SELECT value
      FROM json_each(stories.labels)
      WHERE type = 'text' AND value NOT LIKE 'tag:%'
      ORDER BY key
    )
  ),
  '[]'
)
WHERE EXISTS (
  SELECT 1
  FROM json_each(stories.labels)
  WHERE type = 'text' AND value LIKE 'tag:%'
);
