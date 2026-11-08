import type { Result } from "neverthrow";
import type { Epic, EpicPlan } from "../entities/epic";

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
}
