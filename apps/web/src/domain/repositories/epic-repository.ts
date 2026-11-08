import type { Result } from "neverthrow";
import type { Epic, EpicPlan } from "../entities/epic";
import type { EpicStory, EpicStoryAggregate } from "../entities/epic-progress";

export type EpicPlanPatch = Partial<EpicPlan>;

export const EPIC_REPOSITORY_ERROR = "EPIC_REPOSITORY_ERROR" as const;

export type EpicRepositoryError = typeof EPIC_REPOSITORY_ERROR;

export interface EpicRepository {
  list(projectId: string): Promise<Result<Epic[], EpicRepositoryError>>;
  findByLabelId(
    projectId: string,
    labelId: string,
  ): Promise<Result<Epic | null, EpicRepositoryError>>;
  /** Creates the label's epic with planning on, or does nothing when the label already has one. */
  createEnabled(
    projectId: string,
    labelId: string,
  ): Promise<Result<Epic | null, EpicRepositoryError>>;
  /** Returns null when the epic does not exist or its revision is not `expectedRevision`. */
  setEnabled(
    projectId: string,
    labelId: string,
    enabled: boolean,
    expectedRevision: number,
  ): Promise<Result<Epic | null, EpicRepositoryError>>;
  /** Returns null when the epic does not exist or its revision is not `expectedRevision`. */
  updatePlan(
    projectId: string,
    labelId: string,
    expectedRevision: number,
    patch: EpicPlanPatch,
  ): Promise<Result<Epic | null, EpicRepositoryError>>;
  /**
   * Story aggregates of the epics with planning on, in one pass over
   * Epic → StoryLabel → Story. `labelId` narrows it to one epic. Archived
   * stories are left out. `total` counts each story once across the epics.
   */
  aggregateStories(
    projectId: string,
    labelId?: string,
  ): Promise<
    Result<
      {
        byEpicId: Map<string, EpicStoryAggregate>;
        total: EpicStoryAggregate;
      },
      EpicRepositoryError
    >
  >;
  /** The non-archived stories carrying the label, by story number. */
  listLabelStories(
    projectId: string,
    labelId: string,
  ): Promise<Result<EpicStory[], EpicRepositoryError>>;
}
