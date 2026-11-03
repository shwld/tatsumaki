import { err, ok, type Result } from "neverthrow";
import { canArchiveStory, type Story } from "../../domain/entities/story";
import type { StoryRepository } from "../../domain/repositories/story-repository";

export type ArchiveStoryError =
  | "STORY_NOT_FOUND"
  | "STORY_ARCHIVE_INVALID_STATUS"
  | "STORY_ARCHIVE_CONFLICT"
  | "STORY_ARCHIVE_ERROR";

export interface StoryArchiveRepository {
  setArchived(input: {
    story: Story;
    archived: boolean;
    actorId: string;
    actorName: string;
  }): Promise<Result<boolean, "STORY_ARCHIVE_ERROR">>;
}

export async function setStoryArchived(
  stories: StoryRepository,
  archive: StoryArchiveRepository,
  input: {
    projectId: string;
    storyId: string;
    archived: boolean;
    actorId: string;
    actorName: string;
  },
): Promise<Result<Story, ArchiveStoryError>> {
  const found = await stories.findById(input.projectId, input.storyId);
  if (found.isErr()) return err("STORY_ARCHIVE_ERROR");
  if (!found.value) return err("STORY_NOT_FOUND");
  const story = found.value;
  if ((story.archivedAt !== null) === input.archived) return ok(story);
  if (input.archived && !canArchiveStory(story.status))
    return err("STORY_ARCHIVE_INVALID_STATUS");
  const result = await archive.setArchived({
    story,
    archived: input.archived,
    actorId: input.actorId,
    actorName: input.actorName,
  });
  if (result.isErr()) return err(result.error);
  if (!result.value) return err("STORY_ARCHIVE_CONFLICT");
  const updated = await stories.findById(input.projectId, input.storyId);
  if (updated.isErr() || !updated.value) return err("STORY_ARCHIVE_ERROR");
  return ok(updated.value);
}
