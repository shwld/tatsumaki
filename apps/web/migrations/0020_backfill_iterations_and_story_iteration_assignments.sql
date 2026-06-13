-- Migration number: 0020 	 2026-04-09T00:00:00.000Z
--
-- Backfill strategy:
-- 1) Generate missing historical iterations per project from the earliest
--    relevant date up to the iteration that contains today.
-- 2) Rescue stories that are already in progress/done statuses but still have
--    iteration_id = NULL by assigning the matching iteration from
--    status_changed_at (fallback: created_at).

WITH RECURSIVE project_seed AS (
  SELECT
    p.id AS project_id,
    p.sprint_duration_days AS sprint_days,
    p.iteration_start_day AS start_dow,
    COALESCE(
      (
        SELECT MIN(i.start_date)
        FROM iterations i
        WHERE i.project_id = p.id
      ),
      (
        SELECT MIN(DATE(COALESCE(NULLIF(s.status_changed_at, ''), s.created_at)))
        FROM stories s
        WHERE s.project_id = p.id
          AND s.is_icebox = 0
          AND s.status IN ('Started', 'Finished', 'Delivered', 'Accepted', 'Rejected')
      ),
      DATE('now')
    ) AS anchor_date
  FROM projects p
),
aligned_seed AS (
  SELECT
    project_id,
    sprint_days,
    DATE(
      anchor_date,
      '-' || ((CAST(strftime('%w', anchor_date) AS INTEGER) - start_dow + 7) % 7) || ' days'
    ) AS start_date
  FROM project_seed
),
generated_iterations(project_id, sprint_days, start_date, end_date) AS (
  SELECT
    project_id,
    sprint_days,
    start_date,
    DATE(start_date, '+' || sprint_days || ' days')
  FROM aligned_seed

  UNION ALL

  SELECT
    project_id,
    sprint_days,
    end_date,
    DATE(end_date, '+' || sprint_days || ' days')
  FROM generated_iterations
  WHERE start_date <= DATE('now')
)
INSERT INTO iterations (
  id,
  project_id,
  start_date,
  end_date,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(16))),
  project_id,
  start_date,
  end_date,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM generated_iterations
WHERE start_date <= DATE('now')
ON CONFLICT(project_id, start_date) DO NOTHING;

UPDATE stories
SET
  iteration_id = (
    SELECT i.id
    FROM iterations i
    WHERE i.project_id = stories.project_id
      AND DATE(COALESCE(NULLIF(stories.status_changed_at, ''), stories.created_at)) >= i.start_date
      AND DATE(COALESCE(NULLIF(stories.status_changed_at, ''), stories.created_at)) < i.end_date
    ORDER BY i.start_date DESC
    LIMIT 1
  ),
  is_icebox = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE stories.iteration_id IS NULL
  AND stories.is_icebox = 0
  AND stories.status IN ('Started', 'Finished', 'Delivered', 'Accepted', 'Rejected')
  AND EXISTS (
    SELECT 1
    FROM iterations i
    WHERE i.project_id = stories.project_id
      AND DATE(COALESCE(NULLIF(stories.status_changed_at, ''), stories.created_at)) >= i.start_date
      AND DATE(COALESCE(NULLIF(stories.status_changed_at, ''), stories.created_at)) < i.end_date
  );
