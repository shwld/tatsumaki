import {
  sweepUnreferencedObjects,
  type ObjectSweepTarget,
} from "../../application/usecases/sweep-unreferenced-objects";
import { D1ObjectSweepCursorRepository } from "../../infrastructure/db/repositories/d1-object-sweep-cursor-repository";
import { D1StoredObjectReferenceRepository } from "../../infrastructure/db/repositories/d1-stored-object-reference-repository";
import { R2StoryAttachmentObjectStore } from "../../infrastructure/storage/r2-story-attachment-object-store";
import { R2UserAvatarObjectStore } from "../../infrastructure/storage/r2-user-avatar-object-store";

const PAGE_SIZE = 1000;
const MAX_PAGES_PER_SCOPE = 3;

/** Never throws: a sweep failure must not affect other scheduled work. */
export async function sweepUnreferencedObjectsScheduled(env: {
  DB: D1Database;
  STORY_ATTACHMENTS?: R2Bucket;
  USER_AVATARS?: R2Bucket;
}): Promise<void> {
  const references = new D1StoredObjectReferenceRepository(env.DB);
  const targets: ObjectSweepTarget[] = [];
  if (env.STORY_ATTACHMENTS) {
    targets.push({
      scope: "story-attachments",
      store: new R2StoryAttachmentObjectStore(env.STORY_ATTACHMENTS),
      findReferencedKeys: (keys) =>
        references.findReferencedAttachmentKeys(keys),
    });
  }
  if (env.USER_AVATARS) {
    targets.push({
      scope: "user-avatars",
      store: new R2UserAvatarObjectStore(env.USER_AVATARS),
      findReferencedKeys: (keys) => references.findReferencedAvatarKeys(keys),
    });
  }

  for (const target of targets) {
    const summary = await sweepUnreferencedObjects(
      target,
      new D1ObjectSweepCursorRepository(env.DB),
      { now: new Date(), pageSize: PAGE_SIZE, maxPages: MAX_PAGES_PER_SCOPE },
    );
    if (summary.errors.length > 0) {
      console.error("Object sweep finished with errors", summary);
    } else {
      console.info("Object sweep finished", summary);
    }
  }
}
