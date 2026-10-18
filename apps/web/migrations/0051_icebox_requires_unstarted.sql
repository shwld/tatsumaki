-- Domain invariant: a story in the Icebox is always Unstarted.
-- Rows that violate it (created through status-only updates that did not
-- touch is_icebox) are taken out of the Icebox. iteration_id is left as is.
UPDATE stories
SET is_icebox = 0
WHERE is_icebox = 1
  AND status <> 'Unstarted';
