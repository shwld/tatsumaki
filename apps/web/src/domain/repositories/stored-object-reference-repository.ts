import type { Result } from "neverthrow";

export const STORED_OBJECT_REFERENCE_REPOSITORY_ERROR =
  "STORED_OBJECT_REFERENCE_REPOSITORY_ERROR" as const;

export type StoredObjectReferenceRepositoryError =
  typeof STORED_OBJECT_REFERENCE_REPOSITORY_ERROR;

export interface StoredObjectReferenceRepository {
  /** Of `keys`, those a story attachment row records. */
  findReferencedAttachmentKeys(
    keys: string[],
  ): Promise<Result<Set<string>, StoredObjectReferenceRepositoryError>>;

  /** Of `keys`, those belonging to a user who has an uploaded avatar. */
  findReferencedAvatarKeys(
    keys: string[],
  ): Promise<Result<Set<string>, StoredObjectReferenceRepositoryError>>;
}
