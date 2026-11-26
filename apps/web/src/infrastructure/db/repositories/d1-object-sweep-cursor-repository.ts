import { eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import {
  OBJECT_SWEEP_CURSOR_REPOSITORY_ERROR,
  type ObjectSweepCursorRepository,
  type ObjectSweepCursorRepositoryError,
  type ObjectSweepScope,
} from "../../../domain/repositories/object-sweep-cursor-repository";
import { createDb, type DbClient } from "../client";
import { objectSweepCursorsTable } from "../schema/object-sweep-cursors";

export class D1ObjectSweepCursorRepository
  implements ObjectSweepCursorRepository
{
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async find(
    scope: ObjectSweepScope,
  ): Promise<Result<string | null, ObjectSweepCursorRepositoryError>> {
    try {
      const row = await this.db
        .select({ startAfter: objectSweepCursorsTable.startAfter })
        .from(objectSweepCursorsTable)
        .where(eq(objectSweepCursorsTable.scope, scope))
        .get();
      return ok(row?.startAfter ?? null);
    } catch {
      return err(OBJECT_SWEEP_CURSOR_REPOSITORY_ERROR);
    }
  }

  async save(
    scope: ObjectSweepScope,
    startAfter: string | null,
  ): Promise<Result<void, ObjectSweepCursorRepositoryError>> {
    try {
      const updatedAt = new Date().toISOString();
      await this.db
        .insert(objectSweepCursorsTable)
        .values({ scope, startAfter, updatedAt })
        .onConflictDoUpdate({
          target: objectSweepCursorsTable.scope,
          set: { startAfter, updatedAt },
        });
      return ok(undefined);
    } catch {
      return err(OBJECT_SWEEP_CURSOR_REPOSITORY_ERROR);
    }
  }
}
