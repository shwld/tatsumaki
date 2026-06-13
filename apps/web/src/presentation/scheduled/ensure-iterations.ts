import {
  backfillIncompleteStoriesIntoCurrentIteration,
  ensureCurrentIteration,
} from "../../application/usecases/manage-iterations";
import type {
  IterationStartDay,
  SprintDuration,
} from "../../domain/entities/project";
import { D1IterationRepository } from "../../infrastructure/db/repositories/d1-iteration-repository";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryRepository } from "../../infrastructure/db/repositories/d1-story-repository";
import { todayIso } from "../../shared/date/today-iso";

export async function ensureIterationsForAllProjects(
  db: D1Database,
): Promise<void> {
  const projectRepository = new D1ProjectRepository(db);
  const iterationRepository = new D1IterationRepository(db);
  const storyRepository = new D1StoryRepository(db);

  const projectsResult = await projectRepository.listAll();
  if (projectsResult.isErr()) {
    console.error(
      "Failed to list projects for iteration ensure:",
      projectsResult.error,
    );
    return;
  }

  const today = todayIso();
  let backfilledTotal = 0;

  for (const project of projectsResult.value) {
    const result = await ensureCurrentIteration(iterationRepository, {
      projectId: project.id,
      sprintDurationDays: project.sprintDurationDays as SprintDuration,
      iterationStartDay: project.iterationStartDay as IterationStartDay,
      today,
    });

    if (result.isErr()) {
      console.error(
        `Failed to ensure iteration for project ${project.id}:`,
        result.error,
      );
      continue;
    }

    const backfillResult = await backfillIncompleteStoriesIntoCurrentIteration(
      iterationRepository,
      storyRepository,
      {
        projectId: project.id,
        today,
      },
    );
    if (backfillResult.isErr()) {
      console.error(
        `Failed to backfill incomplete stories for project ${project.id}:`,
        backfillResult.error,
      );
      continue;
    }
    backfilledTotal += backfillResult.value;
  }

  if (backfilledTotal > 0) {
    console.info("Backfilled incomplete stories into current iteration", {
      movedStoryCount: backfilledTotal,
    });
  }
}
