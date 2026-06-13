ALTER TABLE stories
ADD COLUMN story_point INTEGER CHECK (story_point IN (0, 1, 2, 3, 5, 8) OR story_point IS NULL);
