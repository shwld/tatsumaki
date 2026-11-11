-- An epic plan is one rich-text description and any number of owners (story #402).
-- The former purpose, success criteria and single owner are dropped; their data is not carried over.
ALTER TABLE epics DROP COLUMN success_criteria;
ALTER TABLE epics DROP COLUMN owner_id;

CREATE TABLE epic_owners (
  epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (epic_id, user_id)
);

CREATE INDEX idx_epic_owners_user_id ON epic_owners(user_id);

CREATE TRIGGER trg_epic_owners_project_member_insert
BEFORE INSERT ON epic_owners
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM epics e
  JOIN project_members pm ON pm.project_id = e.project_id
  WHERE e.id = NEW.epic_id AND pm.user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'epic_owners.user_id must be a member of the epic project');
END;
