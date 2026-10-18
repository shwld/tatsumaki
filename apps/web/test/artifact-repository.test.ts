import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR,
  ARTIFACT_NOT_FOUND_ERROR,
  type CreateUploadSessionInput,
} from "../src/domain/repositories/artifact-repository";
import { createDb } from "../src/infrastructure/db/client";
import { D1ArtifactRepository } from "../src/infrastructure/db/repositories/d1-artifact-repository";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import {
  artifactFilesTable,
  artifactUploadSessionFilesTable,
  artifactUploadSessionsTable,
  artifactVersionsTable,
  artifactsTable,
} from "../src/infrastructure/db/schema/artifacts";
import { resetDatabase } from "./helpers/db";

const PROJECT_A = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TA";
const PROJECT_B = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TB";
const ARTIFACT_ID = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TC";
const SHA = "a".repeat(64);

const db = () => createDb(env.DB);
const repo = () => new D1ArtifactRepository(env.DB);

async function insertProject(id: string) {
  await db()
    .insert(projectsTable)
    .values({ id, name: `Project ${id}` });
}

async function insertVersion(artifactId: string, version: number) {
  await db().insert(artifactVersionsTable).values({
    artifactId,
    version,
    entrypoint: "index.html",
    treeDigest: SHA,
    fileCount: 1,
    totalBytes: 10,
    createdBy: "user-1",
  });
}

function sessionInput(
  overrides: Partial<CreateUploadSessionInput> = {},
): CreateUploadSessionInput {
  return {
    id: "01JNMVQ8Q9Y6P5KH1XZ4V7C2TS",
    projectId: PROJECT_A,
    artifactId: ARTIFACT_ID,
    baseVersion: null,
    title: "Demo",
    entrypoint: "index.html",
    treeDigest: SHA,
    manifest: [
      {
        path: "index.html",
        size: 10,
        sha256: SHA,
        contentType: "text/html; charset=utf-8",
      },
    ],
    requestHash: "hash-1",
    idempotencyKey: "key-1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdBy: "user-1",
    ...overrides,
  };
}

describe("D1ArtifactRepository", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await insertProject(PROJECT_A);
    await insertProject(PROJECT_B);
  });

  describe("artifacts", () => {
    it("creates and finds an artifact scoped to its project", async () => {
      const created = (
        await repo().create({
          id: ARTIFACT_ID,
          projectId: PROJECT_A,
          title: "Demo",
          createdBy: "user-1",
        })
      )._unsafeUnwrap();
      expect(created).toMatchObject({
        id: ARTIFACT_ID,
        title: "Demo",
        archivedAt: null,
        latestVersion: null,
      });

      expect(
        (await repo().findById(PROJECT_A, ARTIFACT_ID))._unsafeUnwrap()?.id,
      ).toBe(ARTIFACT_ID);
      expect(
        (await repo().findById(PROJECT_B, ARTIFACT_ID))._unsafeUnwrap(),
      ).toBeNull();
    });

    it("lists active artifacts by updatedAt desc and archived separately", async () => {
      const ids = [
        "01JNMVQ8Q9Y6P5KH1XZ4V7C2T1",
        "01JNMVQ8Q9Y6P5KH1XZ4V7C2T2",
        "01JNMVQ8Q9Y6P5KH1XZ4V7C2T3",
      ];
      for (const id of ids) {
        await repo().create({
          id,
          projectId: PROJECT_A,
          title: id,
          createdBy: "user-1",
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await repo().updateMetadata(PROJECT_A, ids[1], { archived: true });

      const active = (
        await repo().listByProject(PROJECT_A, { archived: false })
      )._unsafeUnwrap();
      expect(active.map((a) => a.id)).toEqual([ids[2], ids[0]]);

      const archived = (
        await repo().listByProject(PROJECT_A, { archived: true })
      )._unsafeUnwrap();
      expect(archived.map((a) => a.id)).toEqual([ids[1]]);

      expect(
        (
          await repo().listByProject(PROJECT_B, { archived: false })
        )._unsafeUnwrap(),
      ).toEqual([]);
    });

    it("changes title and archive state without touching versions", async () => {
      await repo().create({
        id: ARTIFACT_ID,
        projectId: PROJECT_A,
        title: "Old",
        createdBy: "user-1",
      });
      await insertVersion(ARTIFACT_ID, 1);

      const renamed = (
        await repo().updateMetadata(PROJECT_A, ARTIFACT_ID, { title: "New" })
      )._unsafeUnwrap();
      const archived = (
        await repo().updateMetadata(PROJECT_A, ARTIFACT_ID, { archived: true })
      )._unsafeUnwrap();
      const unarchived = (
        await repo().updateMetadata(PROJECT_A, ARTIFACT_ID, {
          archived: false,
        })
      )._unsafeUnwrap();

      expect(renamed.title).toBe("New");
      expect(archived.archivedAt).not.toBeNull();
      expect(unarchived.archivedAt).toBeNull();
      expect(
        (await repo().listVersions(PROJECT_A, ARTIFACT_ID))._unsafeUnwrap(),
      ).toHaveLength(1);
    });

    it("returns not-found when updating another project's artifact", async () => {
      await repo().create({
        id: ARTIFACT_ID,
        projectId: PROJECT_A,
        title: "Demo",
        createdBy: "user-1",
      });
      expect(
        (
          await repo().updateMetadata(PROJECT_B, ARTIFACT_ID, { title: "x" })
        )._unsafeUnwrapErr(),
      ).toBe(ARTIFACT_NOT_FOUND_ERROR);
    });
  });

  describe("versions", () => {
    beforeEach(async () => {
      await repo().create({
        id: ARTIFACT_ID,
        projectId: PROJECT_A,
        title: "Demo",
        createdBy: "user-1",
      });
    });

    it("lists versions newest first and returns files for a version", async () => {
      await insertVersion(ARTIFACT_ID, 1);
      await insertVersion(ARTIFACT_ID, 2);
      await db()
        .insert(artifactFilesTable)
        .values([
          {
            artifactId: ARTIFACT_ID,
            version: 2,
            path: "b.js",
            size: 1,
            sha256: SHA,
            contentType: "text/javascript; charset=utf-8",
          },
          {
            artifactId: ARTIFACT_ID,
            version: 2,
            path: "a.html",
            size: 1,
            sha256: SHA,
            contentType: "text/html; charset=utf-8",
          },
        ]);

      const versions = (
        await repo().listVersions(PROJECT_A, ARTIFACT_ID)
      )._unsafeUnwrap();
      expect(versions.map((v) => v.version)).toEqual([2, 1]);

      const detail = (
        await repo().findVersion(PROJECT_A, ARTIFACT_ID, 2)
      )._unsafeUnwrap();
      expect(detail?.files.map((f) => f.path)).toEqual(["a.html", "b.js"]);

      expect(
        (await repo().findVersion(PROJECT_A, ARTIFACT_ID, 3))._unsafeUnwrap(),
      ).toBeNull();
      expect(
        (await repo().findVersion(PROJECT_B, ARTIFACT_ID, 2))._unsafeUnwrap(),
      ).toBeNull();
      expect(
        (await repo().listVersions(PROJECT_B, ARTIFACT_ID))._unsafeUnwrap(),
      ).toEqual([]);
    });

    it("rejects a duplicate (artifact, version) primary key", async () => {
      await insertVersion(ARTIFACT_ID, 1);
      await expect(insertVersion(ARTIFACT_ID, 1)).rejects.toThrow();
    });

    it("rejects a file whose (artifact, version) has no version row", async () => {
      await expect(
        db().insert(artifactFilesTable).values({
          artifactId: ARTIFACT_ID,
          version: 9,
          path: "index.html",
          size: 1,
          sha256: SHA,
          contentType: "text/html; charset=utf-8",
        }),
      ).rejects.toThrow();
    });

    it("rolls back an entire batch when a statement violates a constraint", async () => {
      await insertVersion(ARTIFACT_ID, 1);
      await expect(
        env.DB.batch([
          env.DB.prepare(
            "UPDATE artifacts SET latest_version = 2 WHERE id = ?",
          ).bind(ARTIFACT_ID),
          env.DB.prepare(
            "INSERT INTO artifact_versions (artifact_id, version, entrypoint, tree_digest, file_count, total_bytes, created_by) VALUES (?, 1, 'i', 'd', 0, 0, 'u')",
          ).bind(ARTIFACT_ID),
        ]),
      ).rejects.toThrow();
      const row = await db()
        .select()
        .from(artifactsTable)
        .where(eq(artifactsTable.id, ARTIFACT_ID))
        .get();
      expect(row?.latestVersion).toBeNull();
    });
  });

  describe("upload sessions", () => {
    it("persists a session for an artifact row that does not exist yet", async () => {
      const session = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      expect(session).toMatchObject({
        artifactId: ARTIFACT_ID,
        baseVersion: null,
        status: "pending",
      });
      expect(session.manifest).toEqual(sessionInput().manifest);

      await repo().recordUploadedFile(session.id, "index.html");
      expect(
        (await repo().countUploadedFiles(session.id))._unsafeUnwrap(),
      ).toBe(1);
    });

    it("returns the existing session for a repeated idempotency key", async () => {
      const first = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      const second = (
        await repo().createUploadSession(
          sessionInput({ id: "01JNMVQ8Q9Y6P5KH1XZ4V7C2TT" }),
        )
      )._unsafeUnwrap();
      expect(second.id).toBe(first.id);
    });

    it("returns a non-pending session as-is for the same key and hash", async () => {
      const first = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      await db()
        .update(artifactUploadSessionsTable)
        .set({ status: "published" })
        .where(eq(artifactUploadSessionsTable.id, first.id));
      const again = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      expect(again.status).toBe("published");
    });

    it("rejects the same key with a different request hash", async () => {
      await repo().createUploadSession(sessionInput());
      expect(
        (
          await repo().createUploadSession(
            sessionInput({ requestHash: "different" }),
          )
        )._unsafeUnwrapErr(),
      ).toBe(ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR);
    });

    it("scopes the same key per creator and per project", async () => {
      const a = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      const otherUser = (
        await repo().createUploadSession(
          sessionInput({
            id: "01JNMVQ8Q9Y6P5KH1XZ4V7C2TU",
            createdBy: "user-2",
          }),
        )
      )._unsafeUnwrap();
      const otherProject = (
        await repo().createUploadSession(
          sessionInput({
            id: "01JNMVQ8Q9Y6P5KH1XZ4V7C2TV",
            projectId: PROJECT_B,
          }),
        )
      )._unsafeUnwrap();
      expect(new Set([a.id, otherUser.id, otherProject.id]).size).toBe(3);
    });

    it("hides a session from other users and other projects", async () => {
      const session = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      expect(
        (
          await repo().findUploadSession(PROJECT_A, session.id, "user-1")
        )._unsafeUnwrap()?.id,
      ).toBe(session.id);
      expect(
        (
          await repo().findUploadSession(PROJECT_A, session.id, "user-2")
        )._unsafeUnwrap(),
      ).toBeNull();
      expect(
        (
          await repo().findUploadSession(PROJECT_B, session.id, "user-1")
        )._unsafeUnwrap(),
      ).toBeNull();
    });

    it("records an uploaded path only once", async () => {
      const session = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      await repo().recordUploadedFile(session.id, "a.js");
      await repo().recordUploadedFile(session.id, "a.js");
      await repo().recordUploadedFile(session.id, "b.js");
      expect(
        (await repo().countUploadedFiles(session.id))._unsafeUnwrap(),
      ).toBe(2);
    });

    it("rejects a status outside the allowed set", async () => {
      const session = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      await expect(
        env.DB.prepare(
          "UPDATE artifact_upload_sessions SET status = 'bogus' WHERE id = ?",
        )
          .bind(session.id)
          .run(),
      ).rejects.toThrow();
    });
  });

  describe("project deletion", () => {
    it("cascades to every artifact table", async () => {
      await repo().create({
        id: ARTIFACT_ID,
        projectId: PROJECT_A,
        title: "Demo",
        createdBy: "user-1",
      });
      await insertVersion(ARTIFACT_ID, 1);
      await db().insert(artifactFilesTable).values({
        artifactId: ARTIFACT_ID,
        version: 1,
        path: "index.html",
        size: 1,
        sha256: SHA,
        contentType: "text/html; charset=utf-8",
      });
      const session = (
        await repo().createUploadSession(sessionInput())
      )._unsafeUnwrap();
      await repo().recordUploadedFile(session.id, "index.html");

      await db().delete(projectsTable).where(eq(projectsTable.id, PROJECT_A));

      expect(await db().select().from(artifactsTable).all()).toEqual([]);
      expect(await db().select().from(artifactVersionsTable).all()).toEqual([]);
      expect(await db().select().from(artifactFilesTable).all()).toEqual([]);
      expect(
        await db().select().from(artifactUploadSessionsTable).all(),
      ).toEqual([]);
      expect(
        await db().select().from(artifactUploadSessionFilesTable).all(),
      ).toEqual([]);
    });
  });
});
