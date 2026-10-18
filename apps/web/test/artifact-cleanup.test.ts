import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { err } from "neverthrow";
import { beforeEach, describe, expect, it } from "vitest";
import type { ArtifactObjectStore } from "../src/application/ports/artifact-object-store";
import {
  ARTIFACT_CLEANUP_GRACE_MS,
  cleanupArtifacts,
  type ArtifactCleanupOptions,
} from "../src/application/usecases/artifacts/cleanup-artifacts";
import { deriveArtifactBlobKey } from "../src/domain/artifacts/object-key";
import {
  ARTIFACT_CLEANUP_REPOSITORY_ERROR,
  type ArtifactCleanupRepository,
} from "../src/domain/repositories/artifact-cleanup-repository";
import { createDb } from "../src/infrastructure/db/client";
import { D1ArtifactCleanupRepository } from "../src/infrastructure/db/repositories/d1-artifact-cleanup-repository";
import { D1ArtifactRepository } from "../src/infrastructure/db/repositories/d1-artifact-repository";
import { artifactUploadSessionsTable } from "../src/infrastructure/db/schema/artifacts";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { InMemoryArtifactObjectStore } from "../src/infrastructure/storage/in-memory-artifact-object-store";
import { R2ArtifactObjectStore } from "../src/infrastructure/storage/r2-artifact-object-store";
import { cleanupArtifactsScheduled } from "../src/presentation/scheduled/cleanup-artifacts";
import { resetDatabase } from "./helpers/db";

const PROJECT = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TA";
const GONE_PROJECT = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TB";
const ARTIFACT = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TC";
const OTHER_ARTIFACT = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TD";
const USER = "user-1";
const hash = (letter: string) => letter.repeat(64);
const NOW = new Date("2026-10-18T12:00:00.000Z");
const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const OPTIONS: ArtifactCleanupOptions = {
  now: NOW,
  sessionBatchSize: 50,
  maxProjectPrefixPages: 3,
  maxRemnantObjects: 1000,
};

const db = () => createDb(env.DB);
const artifacts = () => new D1ArtifactRepository(env.DB);
const cleanupRepo = () => new D1ArtifactCleanupRepository(env.DB);

/** The real repository with some methods replaced (class methods do not spread). */
function cleanupRepoWith(
  overrides: Partial<ArtifactCleanupRepository>,
): ArtifactCleanupRepository {
  const real = cleanupRepo();
  return {
    listAbandonedSessions: real.listAbandonedSessions.bind(real),
    findReferencedHashes: real.findReferencedHashes.bind(real),
    findInFlightHashes: real.findInFlightHashes.bind(real),
    markSessionsExpired: real.markSessionsExpired.bind(real),
    findExistingProjectIds: real.findExistingProjectIds.bind(real),
    ...overrides,
  };
}

let counter = 0;
const nextId = () =>
  `01JNMVQ8Q9Y6P5KH1XZ4V7D${String((counter += 1)).padStart(3, "0")}`;

async function createSession(input: {
  artifactId?: string;
  hashes: string[];
  expiresAt: string;
  baseVersion?: number | null;
}) {
  const id = nextId();
  const session = (
    await artifacts().createUploadSession({
      id,
      projectId: PROJECT,
      artifactId: input.artifactId ?? ARTIFACT,
      baseVersion: input.baseVersion ?? null,
      title: "Demo",
      entrypoint: "index.html",
      treeDigest: hash("t"),
      manifest: input.hashes.map((sha256, index) => ({
        path: `f${index}.js`,
        size: 1,
        sha256,
        contentType: "text/javascript; charset=utf-8",
      })),
      requestHash: `h-${id}`,
      idempotencyKey: `k-${id}`,
      expiresAt: input.expiresAt,
      createdBy: USER,
    })
  )._unsafeUnwrap();
  return session;
}

async function putBlob(
  store: ArtifactObjectStore,
  sha256: string,
  artifactId = ARTIFACT,
  projectId = PROJECT,
) {
  const key = deriveArtifactBlobKey({ projectId, artifactId, sha256 });
  await store.put(key, new TextEncoder().encode("x").buffer as ArrayBuffer, {
    contentType: "text/plain",
  });
  return key;
}

async function statusOf(sessionId: string) {
  const row = await db()
    .select()
    .from(artifactUploadSessionsTable)
    .where(eq(artifactUploadSessionsTable.id, sessionId))
    .get();
  return row?.status;
}

async function exists(store: ArtifactObjectStore, key: string) {
  return (await store.get(key)) !== null;
}

/** Publishes a version so that `hashes` are referenced by artifact_files. */
async function publishVersion(hashes: string[]) {
  const session = await createSession({
    hashes,
    expiresAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
  });
  (
    await artifacts().publishUploadSession({
      projectId: PROJECT,
      sessionId: session.id,
      createdBy: USER,
    })
  )._unsafeUnwrap();
}

describe("cleanupArtifacts", () => {
  let store: InMemoryArtifactObjectStore;

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await db().insert(projectsTable).values({ id: PROJECT, name: "P" });
    store = new InMemoryArtifactObjectStore();
  });

  const run = (
    overrides: Partial<ArtifactCleanupOptions> = {},
    repository: ArtifactCleanupRepository = cleanupRepo(),
  ) => cleanupArtifacts(repository, store, { ...OPTIONS, ...overrides });

  describe("abandoned upload sessions", () => {
    it("removes the blobs of a session that expired beyond the grace period", async () => {
      const key = await putBlob(store, hash("a"));
      const session = await createSession({
        hashes: [hash("a")],
        expiresAt: hoursAgo(2),
      });

      const summary = await run();

      expect(await exists(store, key)).toBe(false);
      expect(await statusOf(session.id)).toBe("expired");
      expect(summary).toMatchObject({
        expiredSessions: 1,
        deletedBlobs: 1,
        errors: [],
      });
    });

    it("keeps blobs that a published version still uses", async () => {
      const shared = await putBlob(store, hash("a"));
      const orphan = await putBlob(store, hash("b"));
      await publishVersion([hash("a")]);
      await createSession({
        artifactId: ARTIFACT,
        baseVersion: 1,
        hashes: [hash("a"), hash("b")],
        expiresAt: hoursAgo(3),
      });

      await run();

      expect(await exists(store, shared)).toBe(true);
      expect(await exists(store, orphan)).toBe(false);
    });

    it("keeps blobs that another live session of the same artifact lists", async () => {
      const key = await putBlob(store, hash("a"));
      await createSession({ hashes: [hash("a")], expiresAt: hoursAgo(2) });
      await createSession({
        hashes: [hash("a")],
        expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
      });

      await run();

      expect(await exists(store, key)).toBe(true);
    });

    it("keeps blobs that a session still inside the grace period lists", async () => {
      const key = await putBlob(store, hash("a"));
      await createSession({ hashes: [hash("a")], expiresAt: hoursAgo(5) });
      const recent = await createSession({
        hashes: [hash("a")],
        expiresAt: hoursAgo(0.5),
      });

      await run();

      expect(await exists(store, key)).toBe(true);
      expect(await statusOf(recent.id)).toBe("pending");
    });

    it("leaves unexpired sessions and sessions inside the grace period alone", async () => {
      const liveKey = await putBlob(store, hash("a"));
      const graceKey = await putBlob(store, hash("b"));
      const live = await createSession({
        hashes: [hash("a")],
        expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
      });
      const inGrace = await createSession({
        hashes: [hash("b")],
        expiresAt: new Date(
          NOW.getTime() - ARTIFACT_CLEANUP_GRACE_MS + 60_000,
        ).toISOString(),
      });

      const summary = await run();

      expect(summary.expiredSessions).toBe(0);
      expect(await exists(store, liveKey)).toBe(true);
      expect(await exists(store, graceKey)).toBe(true);
      expect(await statusOf(live.id)).toBe("pending");
      expect(await statusOf(inGrace.id)).toBe("pending");
    });

    it("never touches the blobs of another artifact with the same hash", async () => {
      const mine = await putBlob(store, hash("a"));
      const theirs = await putBlob(store, hash("a"), OTHER_ARTIFACT);
      await createSession({ hashes: [hash("a")], expiresAt: hoursAgo(2) });

      await run();

      expect(await exists(store, mine)).toBe(false);
      expect(await exists(store, theirs)).toBe(true);
    });

    it("does nothing on a second run", async () => {
      await putBlob(store, hash("a"));
      await createSession({ hashes: [hash("a")], expiresAt: hoursAgo(2) });
      await run();

      const again = await run();

      expect(again).toMatchObject({
        expiredSessions: 0,
        deletedBlobs: 0,
        errors: [],
      });
    });

    it("retries a session whose blobs could not be deleted", async () => {
      const key = await putBlob(store, hash("a"));
      const session = await createSession({
        hashes: [hash("a")],
        expiresAt: hoursAgo(2),
      });
      const failingStore: ArtifactObjectStore = {
        put: store.put.bind(store),
        get: store.get.bind(store),
        delete: store.delete.bind(store),
        list: store.list.bind(store),
        listPrefixes: store.listPrefixes.bind(store),
        deleteMany: async () => {
          throw new Error("R2 unavailable");
        },
      };

      const failed = await cleanupArtifacts(
        cleanupRepo(),
        failingStore,
        OPTIONS,
      );

      expect(failed.errors).toHaveLength(1);
      expect(await statusOf(session.id)).toBe("pending");
      expect(await exists(store, key)).toBe(true);

      const retried = await run();

      expect(retried.errors).toEqual([]);
      expect(await statusOf(session.id)).toBe("expired");
      expect(await exists(store, key)).toBe(false);
    });

    it("processes at most the configured number of sessions per run", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createSession({
          hashes: [hash(String(index))],
          expiresAt: hoursAgo(2 + index),
        });
      }

      const first = await run({ sessionBatchSize: 2 });
      const second = await run({ sessionBatchSize: 2 });

      expect(first.expiredSessions).toBe(2);
      expect(second.expiredSessions).toBe(1);
    });
  });

  describe("deleted projects", () => {
    it("removes the objects of projects that no longer exist", async () => {
      const live = await putBlob(store, hash("a"));
      const goneA = await putBlob(store, hash("b"), ARTIFACT, GONE_PROJECT);
      const goneB = await putBlob(
        store,
        hash("c"),
        OTHER_ARTIFACT,
        GONE_PROJECT,
      );

      const summary = await run();

      expect(await exists(store, live)).toBe(true);
      expect(await exists(store, goneA)).toBe(false);
      expect(await exists(store, goneB)).toBe(false);
      expect(summary).toMatchObject({
        deletedProjects: 1,
        deletedRemnantObjects: 2,
      });
    });

    it("ignores prefixes that are not project ids", async () => {
      await store.put(
        "artifacts/not-a-ulid/blobs/x",
        new TextEncoder().encode("x").buffer as ArrayBuffer,
        { contentType: "text/plain" },
      );

      const summary = await run();

      expect(summary.deletedRemnantObjects).toBe(0);
      expect(await exists(store, "artifacts/not-a-ulid/blobs/x")).toBe(true);
    });

    it("stops at the per-run budget and finishes on the next run", async () => {
      const keys = [];
      for (const letter of ["a", "b", "c"]) {
        keys.push(await putBlob(store, hash(letter), ARTIFACT, GONE_PROJECT));
      }

      const first = await run({ maxRemnantObjects: 2 });
      const remaining = (
        await Promise.all(keys.map((key) => exists(store, key)))
      ).filter(Boolean);
      const second = await run({ maxRemnantObjects: 2 });

      expect(first.deletedRemnantObjects).toBe(2);
      expect(first.deletedProjects).toBe(0);
      expect(remaining).toHaveLength(1);
      expect(second.deletedProjects).toBe(1);
      expect(await exists(store, keys[0] as string)).toBe(false);
    });

    it("deletes nothing when D1 cannot confirm the project is gone", async () => {
      const key = await putBlob(store, hash("b"), ARTIFACT, GONE_PROJECT);
      const repository = cleanupRepoWith({
        listAbandonedSessions: async () =>
          err(ARTIFACT_CLEANUP_REPOSITORY_ERROR),
        findExistingProjectIds: async () =>
          err(ARTIFACT_CLEANUP_REPOSITORY_ERROR),
      });

      const summary = await run({}, repository);

      expect(summary.errors).toHaveLength(2);
      expect(await exists(store, key)).toBe(true);
    });
  });

  it("still removes deleted-project objects when the session stage fails", async () => {
    const key = await putBlob(store, hash("b"), ARTIFACT, GONE_PROJECT);
    const repository = cleanupRepoWith({
      listAbandonedSessions: async () => err(ARTIFACT_CLEANUP_REPOSITORY_ERROR),
    });

    const summary = await run({}, repository);

    expect(summary.errors).toEqual(["list abandoned sessions failed"]);
    expect(await exists(store, key)).toBe(false);
  });
});

describe("cleanupArtifactsScheduled", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await createDb(env.DB)
      .insert(projectsTable)
      .values({ id: PROJECT, name: "P" });
  });

  it("does nothing without an ARTIFACTS bucket", async () => {
    await expect(
      cleanupArtifactsScheduled({ DB: env.DB }),
    ).resolves.toBeUndefined();
  });

  it("reclaims abandoned uploads in a real R2 bucket", async () => {
    const r2 = new R2ArtifactObjectStore(env.ARTIFACTS as R2Bucket);
    const key = await putBlob(r2, hash("a"));
    const goneKey = await putBlob(r2, hash("b"), ARTIFACT, GONE_PROJECT);
    const session = await createSession({
      hashes: [hash("a")],
      expiresAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    });

    await cleanupArtifactsScheduled({
      DB: env.DB,
      ARTIFACTS: env.ARTIFACTS,
    });

    expect(await exists(r2, key)).toBe(false);
    expect(await exists(r2, goneKey)).toBe(false);
    expect(await statusOf(session.id)).toBe("expired");
  });

  it("swallows failures so other scheduled work is unaffected", async () => {
    const brokenDb = {
      prepare: () => {
        throw new Error("D1 down");
      },
    } as unknown as D1Database;

    await expect(
      cleanupArtifactsScheduled({ DB: brokenDb, ARTIFACTS: env.ARTIFACTS }),
    ).resolves.toBeUndefined();
  });
});
