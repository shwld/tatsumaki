import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import type { Story } from "../../domain/entities/story";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";

export type MyWorkProject = {
  id: string;
  name: string;
  stories: Story[];
};

export type ListMyWorkStoriesError =
  | ProjectRepositoryError
  | StoryRepositoryError;

export async function listMyWorkStories(
  projectRepository: ProjectRepository,
  storyRepository: StoryRepository,
  userId: string,
): Promise<Result<MyWorkProject[], ListMyWorkStoriesError>> {
  const projectsResult = await projectRepository.listByMember(userId);
  if (projectsResult.isErr()) {
    return err(projectsResult.error);
  }

  const projects = projectsResult.value;
  if (projects.length === 0) {
    return ok([]);
  }

  const projectIds = projects.map((p) => p.id);
  const storiesResult = await storyRepository.listByOwnerAcrossProjects(
    userId,
    projectIds,
  );
  if (storiesResult.isErr()) {
    return err(storiesResult.error);
  }

  const storiesByProject = new Map<string, Story[]>();
  for (const story of storiesResult.value) {
    const existing = storiesByProject.get(story.projectId) ?? [];
    existing.push(story);
    storiesByProject.set(story.projectId, existing);
  }

  const result: MyWorkProject[] = [];
  for (const project of projects) {
    const stories = storiesByProject.get(project.id);
    if (stories && stories.length > 0) {
      result.push({
        id: project.id,
        name: project.name,
        stories,
      });
    }
  }

  return ok(result);
}
