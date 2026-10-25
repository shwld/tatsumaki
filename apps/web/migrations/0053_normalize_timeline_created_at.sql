UPDATE story_timeline_entries
SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
WHERE created_at NOT LIKE '%T%Z';
--> statement-breakpoint
UPDATE story_timeline_entries
SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%T%Z';
