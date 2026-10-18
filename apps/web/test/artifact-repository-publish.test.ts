import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ARTIFACT_NOT_FOUND_ERROR,
  ARTIFACT_PUBLISH_CONFLICT_ERROR,
  ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR,
  type CreateUploadSessionInput,
} from "../src/domain/repositories/artifact-repository";
import { createDb } from "../src/infrastructure/db/client";
import { D1ArtifactRepository } from "../src/infrastructure/db/repositories/d1-artifact-repository";
import {
  artifactFilesTable,
  artifactUploadSessionsTable,
  artifactVersionsTable,
  artifactsTable,
} from "../src/infrastructure/db/schema/artifacts";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { resetDatabase } from "./helpers/db";

const PROJECT_ID = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TA";
const ARTIFACT_ID = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TC";
const USER = "user-1";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const db = () => createDb(env.DB);
const repo = () => new D1ArtifactRepository(env.DB);

let sessionCounter = 0;
function nextId(): string {
  sessionCounter += 1;
  return `01JNMVQ8Q9Y6P5KH1XZ4V7C${String(sessionCounter).padStart(3, "0")}`;
}

async function createSession(
  overrides: Partial<CreateUploadSessionInput> = {},
) {
  const id = overrides.id ?? nextId();
  const result = await repo().createUploadSession({
    id,
    projectId: PROJECT_ID,
    artifactId: ARTIFACT_ID,
    baseVersion: null,
    title: "Demo",
    entrypoint: "index.html",
    treeDigest: SHA_A,
    manifest: [
      {
        path: "index.html",
        size: 10,
        sha256: SHA_A,
        contentType: "text/html; charset=utf-8",
      },
      {
        path: "assets/app.js",
        size: 32,
        sha256: SHA_B,
        contentType: "text/javascript; charset=utf-8",
      },
    ],
    requestHash: `hash-${id}`,
    idempotencyKey: `key-${id}`,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdBy: USER,
    ...overrides,
  });
  return result._unsafeUnwrap();
}

const publish = (sessionId: string, createdBy = USER) =>
  repo().publishUploadSession({
    projectId: PROJECT_ID,
    sessionId,
    createdBy,
  });

async function counts() {
  return {
    artifacts: (await db().select().from(artifactsTable).all()).length,
    versions: (await db().select().from(artifactVersionsTable).all()).length,
    files: (await db().select().from(artifactFilesTable).all()).length,
  };
}

async function latestVersion() {
  const row = await db()
    .select()
    .from(artifactsTable)
    .where(eq(artifactsTable.id, ARTIFACT_ID))
    .get();
  return row?.latestVersion ?? null;
}

async function publishNew() {
  const session = await createSession();
  return publish(session.id);
}

describe("D1ArtifactRepository.publishUploadSession", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await db().insert(projectsTable).values({ id: PROJECT_ID, name: "P" });
  });

  it("creates the artifact, version 1 and its files from the session alone", async () => {
    const result = await publishNew();

    expect(result._unsafeUnwrap()).toEqual({
      artifactId: ARTIFACT_ID,
      version: 1,
    });
    const artifact = await db().select().from(artifactsTable).get();
    expect(artifact).toMatchObject({
      id: ARTIFACT_ID,
      title: "Demo",
      latestVersion: 1,
      createdBy: USER,
    });
    const version = await db().select().from(artifactVersionsTable).get();
    expect(version).toMatchObject({
      version: 1,
      entrypoint: "index.html",
      treeDigest: SHA_A,
      fileCount: 2,
      totalBytes: 42,
    });
    const files = await db().select().from(artifactFilesTable).all();
    expect(files.map((file) => [file.path, file.contentType]).sort()).toEqual([
      ["assets/app.js", "text/javascript; charset=utf-8"],
      ["index.html", "text/html; charset=utf-8"],
    ]);
  });

  it("publishes the next version on top of the base version", async () => {
    await publishNew();
    const session = await createSession({ baseVersion: 1, treeDigest: SHA_B });

    expect((await publish(session.id))._unsafeUnwrap().version).toBe(2);
    expect(await latestVersion()).toBe(2);
    expect((await counts()).versions).toBe(2);
  });

  it("returns the same result when the same session is published again", async () => {
    const session = await createSession();
    await publish(session.id);

    const again = await publish(session.id);

    expect(again._unsafeUnwrap()).toEqual({
      artifactId: ARTIFACT_ID,
      version: 1,
    });
    expect(await counts()).toEqual({ artifacts: 1, versions: 1, files: 2 });
  });

  it("treats two concurrent publishes of one session as one publish", async () => {
    const session = await createSession();

    const [first, second] = await Promise.all([
      publish(session.id),
      publish(session.id),
    ]);

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(await counts()).toEqual({ artifacts: 1, versions: 1, files: 2 });
  });

  it("rejects a session that lost the race and leaves latest untouched", async () => {
    await publishNew();
    const winner = await createSession({ baseVersion: 1, treeDigest: SHA_B });
    const loser = await createSession({ baseVersion: 1, treeDigest: SHA_A });
    await publish(winner.id);

    const result = await publish(loser.id);

    expect(result._unsafeUnwrapErr()).toBe(ARTIFACT_PUBLISH_CONFLICT_ERROR);
    expect(await latestVersion()).toBe(2);
    expect((await counts()).versions).toBe(2);
    const loserRow = await db()
      .select()
      .from(artifactUploadSessionsTable)
      .where(eq(artifactUploadSessionsTable.id, loser.id))
      .get();
    expect(loserRow?.status).toBe("pending");
  });

  it("does not leave a version gap when the base version is ahead of latest", async () => {
    await publishNew();
    const session = await createSession({ baseVersion: 5 });
    const before = await counts();

    const result = await publish(session.id);

    expect(result._unsafeUnwrapErr()).toBe(ARTIFACT_PUBLISH_CONFLICT_ERROR);
    expect(await counts()).toEqual(before);
    expect(await latestVersion()).toBe(1);
  });

  it("rolls everything back when a statement errors mid-batch", async () => {
    await publishNew();
    const session = await createSession({ baseVersion: 1, treeDigest: SHA_B });
    await db()
      .insert(artifactVersionsTable)
      .values({
        artifactId: ARTIFACT_ID,
        version: 2,
        entrypoint: "index.html",
        treeDigest: "c".repeat(64),
        fileCount: 0,
        totalBytes: 0,
        createdBy: "someone-else",
      });
    const before = await counts();

    const result = await publish(session.id);

    expect(result._unsafeUnwrapErr()).toBe(ARTIFACT_PUBLISH_CONFLICT_ERROR);
    expect(await counts()).toEqual(before);
    expect(await latestVersion()).toBe(1);
  });

  it("refuses an expired session without creating anything", async () => {
    const session = await createSession({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const result = await publish(session.id);

    expect(result._unsafeUnwrapErr()).toBe(
      ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR,
    );
    expect(await counts()).toEqual({ artifacts: 0, versions: 0, files: 0 });
  });

  it("does not expose another user's session", async () => {
    const session = await createSession();

    const result = await publish(session.id, "user-2");

    expect(result._unsafeUnwrapErr()).toBe(ARTIFACT_NOT_FOUND_ERROR);
    expect(await counts()).toEqual({ artifacts: 0, versions: 0, files: 0 });
  });

  it("keeps an archived artifact publishable", async () => {
    await publishNew();
    await repo().updateMetadata(PROJECT_ID, ARTIFACT_ID, { archived: true });
    const session = await createSession({ baseVersion: 1, treeDigest: SHA_B });

    expect((await publish(session.id)).isOk()).toBe(true);
  });
});
