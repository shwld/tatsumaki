ALTER TABLE projects ADD COLUMN iteration_start_day INTEGER NOT NULL DEFAULT 1 CHECK (iteration_start_day >= 0 AND iteration_start_day <= 6);
