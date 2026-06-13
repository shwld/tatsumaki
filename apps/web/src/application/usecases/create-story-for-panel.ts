import { err, ok, type Result } from "neverthrow";
import type { Story } from "../../domain/entities/story";
import type {
  IterationRepository,
  IterationRepositoryError,
} from "../../domain/repositories/iteration-repository";
import type {
  StoryActivityRepository,
  StoryActivityRepositoryError,
} from "../../domain/repositories/story-activity-repository";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";
import type { NotificationRepository } from "../../domain/repositories/notification-repository";
import { todayIso } from "../../shared/date/today-iso";
import { createStory, type CreateStoryError } from "./create-story";

export const STORY_PANELS = ["icebox", "backlog", "current"] as const;
export type StoryPanel = (typeof STORY_PANELS)[number];

export const CURRENT_ITERATION_NOT_FOUND_ERROR =
  "CURRENT_ITERATION_NOT_FOUND_ERROR" as const;
export const CURRENT_ITERATION_ASSIGN_FAILED_ERROR =
  "CURRENT_ITERATION_ASSIGN_FAILED_ERROR" as const;
export const CURRENT_ITERATION_ASSIGN_ROLLBACK_FAILED_ERROR =
  "CURRENT_ITERATION_ASSIGN_ROLLBACK_FAILED_ERROR" as const;

export type CreateStoryForPanelError =
  | CreateStoryError
  | typeof CURRENT_ITERATION_NOT_FOUND_ERROR
  | typeof CURRENT_ITERATION_ASSIGN_FAILED_ERROR
  | typeof CURRENT_ITERATION_ASSIGN_ROLLBACK_FAILED_ERROR
  | IterationRepositoryError
  | StoryRepositoryError
  | StoryActivityRepositoryError;

export function isStoryPanel(value: unknown): value is StoryPanel {
  return (
    typeof value === "string" &&
    (STORY_PANELS as readonly string[]).includes(value)
  );
}

type CreateStoryForPanelInput = {
  projectId: string;
  panel: StoryPanel;
  title: string;
  description: string;
  type: string;
  status: string;
  storyPoint: number | null;
  allowedStoryPoints?: number[];
  labels: string[];
  epicId?: string | null;
  ownerIds?: string[];
  requesterId?: string | null;
  releaseDate?: string | null;
  actorUserId: string;
  actorName: string;
};

function isCurrentIteration(
  iteration: { startDate: string; endDate: string },
  todayIso: string,
): boolean {
  return iteration.startDate <= todayIso && iteration.endDate > todayIso;
}

export async function createStoryForPanel(
  storyRepository: StoryRepository,
  activityRepository: StoryActivityRepository,
  iterationRepository: IterationRepository,
  input: CreateStoryForPanelInput,
  options: {
    now?: () => Date;
    notificationRepository?: NotificationRepository;
  } = {},
): Promise<Result<Story, CreateStoryForPanelError>> {
  const isIcebox = input.panel === "icebox";

  if (input.panel === "current") {
    const todayIsoValue = todayIso(options.now?.() ?? new Date());
    const iterationsResult = await iterationRepository.list(input.projectId);
    if (iterationsResult.isErr()) {
      return err(iterationsResult.error);
    }
    const currentIteration = iterationsResult.value.find((iteration) => {
      return isCurrentIteration(iteration, todayIsoValue);
    });
    if (!currentIteration) {
      return err(CURRENT_ITERATION_NOT_FOUND_ERROR);
    }

    const created = await createStory(
      storyRepository,
      activityRepository,
      {
        ...input,
        isIcebox: false,
      },
      { notificationRepository: options.notificationRepository },
    );
    if (created.isErr()) {
      return err(created.error);
    }

    const assignment = await iterationRepository.assignStory({
      projectId: input.projectId,
      iterationId: currentIteration.id,
      storyId: created.value.id,
    });
    if (assignment.isErr() || !assignment.value) {
      const rollback = await storyRepository.delete(
        input.projectId,
        created.value.id,
      );
      if (rollback.isErr() || !rollback.value) {
        return err(CURRENT_ITERATION_ASSIGN_ROLLBACK_FAILED_ERROR);
      }
      return err(CURRENT_ITERATION_ASSIGN_FAILED_ERROR);
    }

    return ok({ ...created.value, iterationId: currentIteration.id });
  }

  return createStory(
    storyRepository,
    activityRepository,
    {
      ...input,
      isIcebox,
    },
    { notificationRepository: options.notificationRepository },
  );
}
