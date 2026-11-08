-- Expand: an epic is planning data bound to exactly one label (ADR-0013). epics.name stays as the rollback path until the contract migration.
DROP INDEX IF EXISTS idx_epics_project_id_name;

ALTER TABLE epics ADD COLUMN label_id TEXT REFERENCES project_labels(id) ON DELETE CASCADE;
ALTER TABLE epics ADD COLUMN enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1));
ALTER TABLE epics ADD COLUMN success_criteria TEXT NOT NULL DEFAULT '';
ALTER TABLE epics ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE epics ADD COLUMN planned_start TEXT;
ALTER TABLE epics ADD COLUMN planned_end TEXT;
ALTER TABLE epics ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE epics ADD COLUMN outcome_status TEXT NOT NULL DEFAULT 'unevaluated' CHECK (outcome_status IN ('unevaluated', 'achieved', 'missed'));
ALTER TABLE epics ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX idx_epics_label_id ON epics(label_id);

CREATE TRIGGER trg_epics_label_same_project_insert
BEFORE INSERT ON epics
FOR EACH ROW
WHEN NEW.label_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM project_labels WHERE id = NEW.label_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'epics.label_id must reference a label of the same project');
END;

CREATE TRIGGER trg_epics_label_same_project_update
BEFORE UPDATE OF label_id, project_id ON epics
FOR EACH ROW
WHEN NEW.label_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM project_labels WHERE id = NEW.label_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'epics.label_id must reference a label of the same project');
END;
