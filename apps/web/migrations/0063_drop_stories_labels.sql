-- Contract: story label membership lives only in story_labels (ADR-0013).
ALTER TABLE stories DROP COLUMN labels;
