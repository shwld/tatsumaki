ALTER TABLE projects ADD COLUMN estimate_bugs INTEGER NOT NULL DEFAULT 1 CHECK (estimate_bugs IN (0, 1));
ALTER TABLE projects ADD COLUMN estimate_chores INTEGER NOT NULL DEFAULT 1 CHECK (estimate_chores IN (0, 1));
