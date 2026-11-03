import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type { StoryArchiveRepository } from "../../../application/usecases/set-story-archived";
import type { Story } from "../../../domain/entities/story";

export class D1StoryArchiveRepository implements StoryArchiveRepository {
  constructor(private readonly db: D1Database) {}

  async setArchived(input: {
    story: Story;
    archived: boolean;
    actorId: string;
    actorName: string;
  }): Promise<Result<boolean, "STORY_ARCHIVE_ERROR">> {
    const now = new Date().toISOString();
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            "UPDATE stories SET archived_at = ?, updated_at = ?, iteration_id = CASE WHEN ? = 0 AND EXISTS (SELECT 1 FROM iterations WHERE id = stories.iteration_id AND end_date <= ?) THEN NULL ELSE iteration_id END WHERE project_id = ? AND id = ? AND status = ? AND archived_at IS ?",
          )
          .bind(
            input.archived ? now : null,
            now,
            input.archived ? 1 : 0,
            now.slice(0, 10),
            input.story.projectId,
            input.story.id,
            input.story.status,
            input.story.archivedAt,
          ),
        this.db
          .prepare(
            "INSERT INTO story_timeline_entries (id, project_id, story_id, entry_type, actor_user_id, actor_name, action, field_name, old_value, new_value, created_at, updated_at) SELECT ?, ?, ?, 'activity', ?, ?, ?, 'story', NULL, NULL, ?, ? WHERE changes() = 1",
          )
          .bind(
            ulid(),
            input.story.projectId,
            input.story.id,
            input.actorId,
            input.actorName,
            input.archived ? "archived" : "unarchived",
            now,
            now,
          ),
      ]);
      return ok(results[0].meta.changes === 1);
    } catch {
      return err("STORY_ARCHIVE_ERROR");
    }
  }
}
