import type { Result } from "neverthrow";
import type {
  ListStoryTimelinePageResult,
  StoryTimelineReadRepository,
  StoryTimelineReadRepositoryError,
} from "../../domain/repositories/story-timeline-read-repository";

export type ListStoryTimelineError = StoryTimelineReadRepositoryError;

export async function listStoryTimeline(
  readRepository: StoryTimelineReadRepository,
  input: {
    projectId: string;
    storyId: string;
    limit: number;
    before?: { createdAt: string; id: string };
  },
): Promise<Result<ListStoryTimelinePageResult, ListStoryTimelineError>> {
  return readRepository.listByStoryPage(input.projectId, input.storyId, {
    limit: input.limit,
    before: input.before,
  });
}
