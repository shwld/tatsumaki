import { cleanupArtifacts } from "../../application/usecases/artifacts/cleanup-artifacts";
import { D1ArtifactCleanupRepository } from "../../infrastructure/db/repositories/d1-artifact-cleanup-repository";
import { R2ArtifactObjectStore } from "../../infrastructure/storage/r2-artifact-object-store";

const SESSION_BATCH_SIZE = 20;
const MAX_PROJECT_PREFIX_PAGES = 3;
const MAX_REMNANT_OBJECTS = 2000;

/** Never throws: a cleanup failure must not affect other scheduled work. */
export async function cleanupArtifactsScheduled(env: {
  DB: D1Database;
  ARTIFACTS?: R2Bucket;
}): Promise<void> {
  if (!env.ARTIFACTS) return;

  try {
    const summary = await cleanupArtifacts(
      new D1ArtifactCleanupRepository(env.DB),
      new R2ArtifactObjectStore(env.ARTIFACTS),
      {
        now: new Date(),
        sessionBatchSize: SESSION_BATCH_SIZE,
        maxProjectPrefixPages: MAX_PROJECT_PREFIX_PAGES,
        maxRemnantObjects: MAX_REMNANT_OBJECTS,
      },
    );
    if (summary.errors.length > 0) {
      console.error("Artifact cleanup finished with errors", summary);
    } else {
      console.info("Artifact cleanup finished", summary);
    }
  } catch (error) {
    console.error("Artifact cleanup failed", error);
  }
}
