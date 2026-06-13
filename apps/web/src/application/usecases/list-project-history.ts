import type { Result } from "neverthrow";
import type {
  ProjectHistoryPage,
  StoryActivityRepository,
  StoryActivityRepositoryError,
} from "../../domain/repositories/story-activity-repository";

export type ListProjectHistoryError = StoryActivityRepositoryError;

export type ListProjectHistoryInput = {
  limit: number;
  before?: { createdAt: string; id: string };
};

export async function listProjectHistory(
  activityRepository: StoryActivityRepository,
  projectId: string,
  input: ListProjectHistoryInput,
): Promise<Result<ProjectHistoryPage, ListProjectHistoryError>> {
  return activityRepository.listByProject(projectId, {
    limit: input.limit,
    before: input.before,
  });
}
