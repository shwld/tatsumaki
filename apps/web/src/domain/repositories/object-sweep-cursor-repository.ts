import type { Result } from "neverthrow";

export const OBJECT_SWEEP_CURSOR_REPOSITORY_ERROR =
  "OBJECT_SWEEP_CURSOR_REPOSITORY_ERROR" as const;

export type ObjectSweepCursorRepositoryError =
  typeof OBJECT_SWEEP_CURSOR_REPOSITORY_ERROR;

export type ObjectSweepScope = "story-attachments" | "user-avatars";

export interface ObjectSweepCursorRepository {
  /** The last key inspected, or null to start from the beginning. */
  find(
    scope: ObjectSweepScope,
  ): Promise<Result<string | null, ObjectSweepCursorRepositoryError>>;

  save(
    scope: ObjectSweepScope,
    startAfter: string | null,
  ): Promise<Result<void, ObjectSweepCursorRepositoryError>>;
}
