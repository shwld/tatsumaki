import { and, isNotNull, sql, type AnyColumn } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import {
  STORED_OBJECT_REFERENCE_REPOSITORY_ERROR,
  type StoredObjectReferenceRepository,
  type StoredObjectReferenceRepositoryError,
} from "../../../domain/repositories/stored-object-reference-repository";
import {
  deriveUserAvatarKey,
  parseUserAvatarKey,
} from "../../../domain/users/user-avatar-key";
import { createDb, type DbClient } from "../client";
import { storyAttachmentsTable } from "../schema/story-attachments";
import { usersTable } from "../schema/users";

/** One bound parameter however many values, to stay under D1's parameter limit. */
const isOneOf = (column: AnyColumn, values: string[]) =>
  sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(values)}))`;

export class D1StoredObjectReferenceRepository
  implements StoredObjectReferenceRepository
{
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async findReferencedAttachmentKeys(
    keys: string[],
  ): Promise<Result<Set<string>, StoredObjectReferenceRepositoryError>> {
    try {
      const rows = await this.db
        .select({ fileKey: storyAttachmentsTable.fileKey })
        .from(storyAttachmentsTable)
        .where(isOneOf(storyAttachmentsTable.fileKey, keys))
        .all();
      return ok(new Set(rows.map((row) => row.fileKey)));
    } catch {
      return err(STORED_OBJECT_REFERENCE_REPOSITORY_ERROR);
    }
  }

  async findReferencedAvatarKeys(
    keys: string[],
  ): Promise<Result<Set<string>, StoredObjectReferenceRepositoryError>> {
    try {
      const rows = await this.db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            isOneOf(usersTable.id, keys.map(parseUserAvatarKey)),
            isNotNull(usersTable.avatarUrl),
          ),
        )
        .all();
      return ok(new Set(rows.map((row) => deriveUserAvatarKey(row.id))));
    } catch {
      return err(STORED_OBJECT_REFERENCE_REPOSITORY_ERROR);
    }
  }
}
