ALTER TABLE iteration_overrides
ADD COLUMN iteration_start_date TEXT;

ALTER TABLE iteration_overrides
ADD COLUMN iteration_end_date TEXT;

UPDATE iteration_overrides
SET
  iteration_start_date = (
    SELECT i.start_date
    FROM iterations AS i
    WHERE
      i.project_id = iteration_overrides.project_id
      AND i.iteration_number = iteration_overrides.iteration_number
    LIMIT 1
  ),
  iteration_end_date = (
    SELECT i.end_date
    FROM iterations AS i
    WHERE
      i.project_id = iteration_overrides.project_id
      AND i.iteration_number = iteration_overrides.iteration_number
    LIMIT 1
  );
