import { deriveArtifactBlobKey } from "../../../domain/artifacts/object-key";
import type { ArtifactCleanupRepository } from "../../../domain/repositories/artifact-cleanup-repository";
import type { ArtifactObjectStore } from "../../ports/artifact-object-store";
import { ULID_PATTERN } from "./errors";

/** An upload session is kept this long after expiry before it is reclaimed. */
export const ARTIFACT_CLEANUP_GRACE_MS = 60 * 60 * 1000;

const ARTIFACTS_PREFIX = "artifacts/";
const PREFIX_PAGE_SIZE = 1000;

export type ArtifactCleanupOptions = {
  now: Date;
  sessionBatchSize: number;
  /** Pages of project prefixes inspected per run for deleted projects. */
  maxProjectPrefixPages: number;
  /** Upper bound of objects removed per run for deleted projects. */
  maxRemnantObjects: number;
};

export type ArtifactCleanupSummary = {
  expiredSessions: number;
  deletedBlobs: number;
  deletedProjects: number;
  deletedRemnantObjects: number;
  errors: string[];
};

/**
 * Reclaims storage in two independent stages. Failures are collected rather
 * than thrown so one broken stage never hides the other.
 *
 * Stage 1 (D1 driven): for every upload session that expired more than the
 * grace period ago, delete the blobs it listed unless a published version or
 * another session that may still upload uses them, then mark it expired.
 * Blobs are removed before the session is marked so a crash is retried.
 *
 * Stage 2: delete R2 objects of projects that no longer exist. Nothing is
 * deleted when D1 cannot confirm that the project is gone.
 */
export async function cleanupArtifacts(
  repository: ArtifactCleanupRepository,
  objectStore: ArtifactObjectStore,
  options: ArtifactCleanupOptions,
): Promise<ArtifactCleanupSummary> {
  const summary: ArtifactCleanupSummary = {
    expiredSessions: 0,
    deletedBlobs: 0,
    deletedProjects: 0,
    deletedRemnantObjects: 0,
    errors: [],
  };

  await reclaimAbandonedSessions(repository, objectStore, options, summary);
  await reclaimDeletedProjects(repository, objectStore, options, summary);
  return summary;
}

async function reclaimAbandonedSessions(
  repository: ArtifactCleanupRepository,
  objectStore: ArtifactObjectStore,
  options: ArtifactCleanupOptions,
  summary: ArtifactCleanupSummary,
): Promise<void> {
  const graceStart = new Date(
    options.now.getTime() - ARTIFACT_CLEANUP_GRACE_MS,
  ).toISOString();

  const sessions = await repository.listAbandonedSessions({
    expiredBefore: graceStart,
    limit: options.sessionBatchSize,
  });
  if (sessions.isErr()) {
    summary.errors.push("list abandoned sessions failed");
    return;
  }

  for (const session of sessions.value) {
    try {
      const referenced = await repository.findReferencedHashes(
        session.artifactId,
        session.blobSha256s,
      );
      const inFlight = await repository.findInFlightHashes({
        artifactId: session.artifactId,
        excludeSessionId: session.id,
        activeSince: graceStart,
      });
      if (referenced.isErr() || inFlight.isErr()) {
        summary.errors.push(`reference lookup failed for ${session.id}`);
        continue;
      }

      const keys = session.blobSha256s
        .filter(
          (sha256) =>
            !referenced.value.has(sha256) && !inFlight.value.has(sha256),
        )
        .map((sha256) =>
          deriveArtifactBlobKey({
            projectId: session.projectId,
            artifactId: session.artifactId,
            sha256,
          }),
        );

      if (keys.length > 0) await objectStore.deleteMany(keys);

      const marked = await repository.markSessionsExpired([session.id]);
      if (marked.isErr()) {
        summary.errors.push(`mark expired failed for ${session.id}`);
        continue;
      }
      summary.expiredSessions += 1;
      summary.deletedBlobs += keys.length;
    } catch {
      summary.errors.push(`cleanup failed for session ${session.id}`);
    }
  }
}

async function reclaimDeletedProjects(
  repository: ArtifactCleanupRepository,
  objectStore: ArtifactObjectStore,
  options: ArtifactCleanupOptions,
  summary: ArtifactCleanupSummary,
): Promise<void> {
  try {
    let cursor: string | undefined;
    for (let page = 0; page < options.maxProjectPrefixPages; page += 1) {
      const listed = await objectStore.listPrefixes({
        prefix: ARTIFACTS_PREFIX,
        limit: PREFIX_PAGE_SIZE,
        cursor,
      });

      const prefixByProject = new Map<string, string>();
      for (const prefix of listed.prefixes) {
        const projectId = prefix.slice(ARTIFACTS_PREFIX.length, -1);
        if (ULID_PATTERN.test(projectId))
          prefixByProject.set(projectId, prefix);
      }

      const existing = await repository.findExistingProjectIds([
        ...prefixByProject.keys(),
      ]);
      if (existing.isErr()) {
        summary.errors.push("project lookup failed");
        return;
      }

      for (const [projectId, prefix] of prefixByProject) {
        if (existing.value.has(projectId)) continue;
        if (summary.deletedRemnantObjects >= options.maxRemnantObjects) return;

        const removed = await deleteAllUnder(
          objectStore,
          prefix,
          options.maxRemnantObjects - summary.deletedRemnantObjects,
        );
        summary.deletedRemnantObjects += removed.deleted;
        if (removed.complete) summary.deletedProjects += 1;
      }

      if (listed.cursor === null) return;
      cursor = listed.cursor;
    }
  } catch {
    summary.errors.push("project remnant cleanup failed");
  }
}

async function deleteAllUnder(
  objectStore: ArtifactObjectStore,
  prefix: string,
  budget: number,
): Promise<{ deleted: number; complete: boolean }> {
  let deleted = 0;
  while (deleted < budget) {
    const page = await objectStore.list({
      prefix,
      limit: Math.min(1000, budget - deleted),
    });
    if (page.keys.length === 0) return { deleted, complete: true };
    await objectStore.deleteMany(page.keys);
    deleted += page.keys.length;
    if (page.cursor === null && deleted <= budget) {
      return { deleted, complete: true };
    }
  }
  return { deleted, complete: false };
}
