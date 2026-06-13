-- Migration: Add Rejected status to story status constraint
-- Drop old CHECK constraint and recreate with Rejected included
-- SQLite does not support ALTER COLUMN, so we recreate via a new table approach
-- However, since SQLite CHECK constraints are per-column and not named,
-- we need a pragmatic approach: create a new column, copy, drop old, rename.

-- Step 1: Add a new column with the updated CHECK constraint
ALTER TABLE stories ADD COLUMN status_new TEXT NOT NULL DEFAULT 'Unstarted'
  CHECK (status_new IN ('Unstarted', 'Started', 'Finished', 'Delivered', 'Accepted', 'Rejected'));

-- Step 2: Copy existing status values
UPDATE stories SET status_new = status;

-- Step 3: Drop old column (SQLite 3.35.0+)
ALTER TABLE stories DROP COLUMN status;

-- Step 4: Rename new column
ALTER TABLE stories RENAME COLUMN status_new TO status;
