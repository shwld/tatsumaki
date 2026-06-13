-- Migration: Add 'release' to story type constraint
-- SQLite does not support ALTER COLUMN, so we recreate via a new column approach
-- (same pattern as 0013_add_rejected_status.sql)

-- Step 1: Add a new column with the updated CHECK constraint
ALTER TABLE stories ADD COLUMN type_new TEXT NOT NULL DEFAULT 'feature'
  CHECK (type_new IN ('feature', 'bug', 'chore', 'release'));

-- Step 2: Copy existing type values
UPDATE stories SET type_new = type;

-- Step 3: Drop old column (SQLite 3.35.0+)
ALTER TABLE stories DROP COLUMN type;

-- Step 4: Rename new column
ALTER TABLE stories RENAME COLUMN type_new TO type;
