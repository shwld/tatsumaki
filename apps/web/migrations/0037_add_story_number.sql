ALTER TABLE stories ADD COLUMN story_number INTEGER;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY created_at ASC, id ASC
    ) AS next_story_number
  FROM stories
)
UPDATE stories
SET story_number = (
  SELECT next_story_number
  FROM ordered
  WHERE ordered.id = stories.id
);

CREATE UNIQUE INDEX stories_project_id_story_number_idx
  ON stories(project_id, story_number);
