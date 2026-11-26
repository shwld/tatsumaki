import type { Result } from "neverthrow";
import type {
  ObjectSweepCursorRepository,
  ObjectSweepScope,
} from "../../domain/repositories/object-sweep-cursor-repository";
import type { StoredObjectReferenceRepositoryError } from "../../domain/repositories/stored-object-reference-repository";
import type { SweepableObjectStore } from "../ports/sweepable-object-store";

/** Uploads write the object before its row, so a young object may still gain one. */
export const OBJECT_SWEEP_GRACE_MS = 60 * 60 * 1000;

export type ObjectSweepTarget = {
  scope: ObjectSweepScope;
  store: SweepableObjectStore;
  findReferencedKeys: (
    keys: string[],
  ) => Promise<Result<Set<string>, StoredObjectReferenceRepositoryError>>;
};

export type ObjectSweepOptions = {
  now: Date;
  pageSize: number;
  maxPages: number;
};

export type ObjectSweepSummary = {
  scope: ObjectSweepScope;
  examined: number;
  deleted: number;
  errors: string[];
};

/**
 * Deletes stored objects that no D1 row refers to. Deleting rows (directly or by
 * cascade) is therefore enough to have their objects removed.
 *
 * Never throws. Nothing in a page is deleted when D1 cannot answer, and the
 * cursor only advances past pages that were fully handled.
 */
export async function sweepUnreferencedObjects(
  target: ObjectSweepTarget,
  cursors: ObjectSweepCursorRepository,
  options: ObjectSweepOptions,
): Promise<ObjectSweepSummary> {
  const summary: ObjectSweepSummary = {
    scope: target.scope,
    examined: 0,
    deleted: 0,
    errors: [],
  };
  const uploadedBefore = options.now.getTime() - OBJECT_SWEEP_GRACE_MS;

  try {
    const cursor = await cursors.find(target.scope);
    if (cursor.isErr()) {
      summary.errors.push("cursor lookup failed");
      return summary;
    }

    let startAfter = cursor.value;
    for (let page = 0; page < options.maxPages; page += 1) {
      const listed = await target.store.listAfter({
        startAfter,
        limit: options.pageSize,
      });
      const candidates = listed.objects
        .filter((object) => object.uploadedAt.getTime() < uploadedBefore)
        .map((object) => object.key);

      if (candidates.length > 0) {
        const referenced = await target.findReferencedKeys(candidates);
        if (referenced.isErr()) {
          summary.errors.push("reference lookup failed");
          return summary;
        }
        const unreferenced = candidates.filter(
          (key) => !referenced.value.has(key),
        );
        if (unreferenced.length > 0) {
          await target.store.deleteMany(unreferenced);
          summary.deleted += unreferenced.length;
        }
      }
      summary.examined += listed.objects.length;

      startAfter = listed.truncated
        ? (listed.objects.at(-1)?.key ?? null)
        : null;
      const saved = await cursors.save(target.scope, startAfter);
      if (saved.isErr()) {
        summary.errors.push("cursor save failed");
        return summary;
      }
      if (startAfter === null) return summary;
    }
  } catch {
    summary.errors.push("sweep failed");
  }
  return summary;
}
