import type { Result } from "neverthrow";
import type { StoryComment } from "../entities/story-timeline";

export const STORY_COMMENT_REPOSITORY_ERROR =
  "STORY_COMMENT_REPOSITORY_ERROR" as const;

export const STORY_COMMENT_NOT_FOUND_ERROR =
  "STORY_COMMENT_NOT_FOUND_ERROR" as const;

export type StoryCommentRepositoryError =
  | typeof STORY_COMMENT_REPOSITORY_ERROR
  | typeof STORY_COMMENT_NOT_FOUND_ERROR;

export type StoryCommentListPage = {
  entries: StoryComment[];
  hasMore: boolean;
  nextBefore: { createdAt: string; id: string } | null;
};

export interface StoryCommentRepository {
  listByProject(
    projectId: string,
    options?: {
      limit: number;
      before?: { createdAt: string; id: string };
    },
  ): Promise<Result<StoryCommentListPage, StoryCommentRepositoryError>>;

  listByStory(
    projectId: string,
    storyId: string,
  ): Promise<Result<StoryComment[], StoryCommentRepositoryError>>;

  create(
    projectId: string,
    storyId: string,
    input: { userId: string; actorName: string; body: string },
  ): Promise<Result<StoryComment, StoryCommentRepositoryError>>;

  update(
    projectId: string,
    commentId: string,
    input: { body: string },
  ): Promise<Result<StoryComment, StoryCommentRepositoryError>>;

  delete(
    projectId: string,
    commentId: string,
  ): Promise<Result<void, StoryCommentRepositoryError>>;

  /** Removes all comment entries for a story (e.g. before story row is deleted). */
  deleteAllForStory(
    projectId: string,
    storyId: string,
  ): Promise<Result<void, StoryCommentRepositoryError>>;

  findById(
    projectId: string,
    commentId: string,
  ): Promise<Result<StoryComment | null, StoryCommentRepositoryError>>;
}
