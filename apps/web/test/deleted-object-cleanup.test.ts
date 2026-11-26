import { env } from "cloudflare:test";
import { err } from "neverthrow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "../src/application/usecases/delete-account";
import { deleteProject } from "../src/application/usecases/delete-project";
import { deleteStory } from "../src/application/usecases/delete-story";
import {
  getUserAvatarContent,
  USER_AVATAR_NOT_FOUND_ERROR,
} from "../src/application/usecases/get-user-avatar-content";
import {
  sweepUnreferencedObjects,
  type ObjectSweepOptions,
  type ObjectSweepTarget,
} from "../src/application/usecases/sweep-unreferenced-objects";
import { uploadStoryAttachment } from "../src/application/usecases/upload-story-attachment";
import { uploadUserAvatar } from "../src/application/usecases/upload-user-avatar";
import { deriveArtifactBlobKey } from "../src/domain/artifacts/object-key";
import { STORED_OBJECT_REFERENCE_REPOSITORY_ERROR } from "../src/domain/repositories/stored-object-reference-repository";
import { D1ObjectSweepCursorRepository } from "../src/infrastructure/db/repositories/d1-object-sweep-cursor-repository";
import { D1StoredObjectReferenceRepository } from "../src/infrastructure/db/repositories/d1-stored-object-reference-repository";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { D1StoryActivityRepository } from "../src/infrastructure/db/repositories/d1-story-activity-repository";
import { D1StoryAttachmentRepository } from "../src/infrastructure/db/repositories/d1-story-attachment-repository";
import { D1StoryCommentRepository } from "../src/infrastructure/db/repositories/d1-story-comment-repository";
import { D1StoryRepository } from "../src/infrastructure/db/repositories/d1-story-repository";
import { D1UserRepository } from "../src/infrastructure/db/repositories/d1-user-repository";
import { R2StoryAttachmentObjectStore } from "../src/infrastructure/storage/r2-story-attachment-object-store";
import { R2UserAvatarObjectStore } from "../src/infrastructure/storage/r2-user-avatar-object-store";
import worker from "../src/index";
import { resetDatabase } from "./helpers/db";

const body = () => new Response("x").body as ReadableStream<Uint8Array>;
const keys = async (bucket: R2Bucket) =>
  (await bucket.list()).objects.map((object) => object.key);

async function emptyBuckets() {
  for (const bucket of [
    env.USER_AVATARS!,
    env.STORY_ATTACHMENTS!,
    env.ARTIFACTS!,
  ]) {
    const existing = await keys(bucket);
    if (existing.length > 0) await bucket.delete(existing);
  }
}

async function deleteLeaver() {
  (
    await deleteAccount(
      new D1UserRepository(env.DB),
      new D1ProjectRepository(env.DB),
      { userId: "leaver", confirmEmail: "leaver@example.com", now: new Date() },
      { waitUntil: () => undefined },
    )
  )._unsafeUnwrap();
}

async function seedUser(id: string) {
  const users = new D1UserRepository(env.DB);
  (
    await users.create({ id, displayName: id, email: `${id}@example.com` })
  )._unsafeUnwrap();
  (
    await uploadUserAvatar(
      users,
      new R2UserAvatarObjectStore(env.USER_AVATARS!),
      {
        userId: id,
        mimeType: "image/png",
        fileBody: body(),
      },
    )
  )._unsafeUnwrap();
}

async function seedProjectWithAttachment(name: string) {
  const project = (
    await new D1ProjectRepository(env.DB).create({
      name,
      ownerUserId: "keeper",
    })
  )._unsafeUnwrap();
  const story = (
    await new D1StoryRepository(env.DB).create({
      projectId: project.id,
      title: "Story",
      description: "",
      type: "feature",
      status: "Unstarted",
      storyPoint: null,
      labelIds: [],
      isIcebox: false,
      ownerIds: [],
      requesterId: null,
    })
  )._unsafeUnwrap();
  (
    await uploadStoryAttachment(
      new D1StoryAttachmentRepository(env.DB),
      new R2StoryAttachmentObjectStore(env.STORY_ATTACHMENTS!),
      {
        projectId: project.id,
        storyId: story.id,
        uploadedBy: "keeper",
        fileName: "memo.txt",
        mimeType: "text/plain",
        fileSize: 1,
        fileBody: body(),
      },
    )
  )._unsafeUnwrap();
  await env.ARTIFACTS!.put(
    deriveArtifactBlobKey({
      projectId: project.id,
      artifactId: project.id,
      sha256: "a".repeat(64),
    }),
    "x",
  );
  return { project, story };
}

/** Runs the cron trigger well after the upload grace period has passed. */
async function runScheduledLater() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 3 * 3_600_000);
  const tasks: Promise<unknown>[] = [];
  await worker.scheduled({} as ScheduledEvent, env, {
    waitUntil: (task: Promise<unknown>) => tasks.push(task),
  } as unknown as ExecutionContext);
  await Promise.all(tasks);
  vi.useRealTimers();
}

describe("stored objects after deletion", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await emptyBuckets();
    await seedUser("keeper");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes the avatar of a deleted account and keeps the others", async () => {
    await seedUser("leaver");

    await deleteLeaver();
    await runScheduledLater();

    expect(await keys(env.USER_AVATARS!)).toEqual(["user-avatars/keeper"]);
  });

  it("removes attachments and artifacts of a deleted project and keeps the others", async () => {
    const kept = await seedProjectWithAttachment("Kept");
    const gone = await seedProjectWithAttachment("Gone");

    (
      await deleteProject(
        { repository: new D1ProjectRepository(env.DB) },
        {
          projectId: gone.project.id,
          userId: "keeper",
          confirmProjectName: "Gone",
        },
      )
    )._unsafeUnwrap();
    await runScheduledLater();

    expect(await keys(env.STORY_ATTACHMENTS!)).toEqual([
      expect.stringContaining(`story-attachments/${kept.project.id}/`),
    ]);
    expect(await keys(env.ARTIFACTS!)).toEqual([
      expect.stringContaining(`artifacts/${kept.project.id}/`),
    ]);
  });

  it("removes attachments of a deleted story and keeps the others", async () => {
    await seedProjectWithAttachment("Kept");
    const { project, story } = await seedProjectWithAttachment("Story gone");

    (
      await deleteStory(
        new D1StoryRepository(env.DB),
        new D1StoryActivityRepository(env.DB),
        new D1StoryCommentRepository(env.DB),
        {
          projectId: project.id,
          storyId: story.id,
          actorUserId: "keeper",
          actorName: "keeper",
        },
      )
    )._unsafeUnwrap();
    await runScheduledLater();

    expect(await keys(env.STORY_ATTACHMENTS!)).toEqual([
      expect.not.stringContaining(`/${project.id}/`),
    ]);
  });

  it("stops serving a deleted account's avatar before the sweep runs", async () => {
    await seedUser("leaver");
    const users = new D1UserRepository(env.DB);
    const store = new R2UserAvatarObjectStore(env.USER_AVATARS!);
    expect((await getUserAvatarContent(users, store, "leaver")).isOk()).toBe(
      true,
    );

    await deleteLeaver();

    expect(
      (await getUserAvatarContent(users, store, "leaver"))._unsafeUnwrapErr(),
    ).toBe(USER_AVATAR_NOT_FOUND_ERROR);
  });

  it("does not hand the old avatar to a re-registered account", async () => {
    await seedUser("leaver");
    await deleteLeaver();
    (
      await new D1UserRepository(env.DB).create({
        id: "leaver",
        displayName: "again",
        email: "leaver@example.com",
      })
    )._unsafeUnwrap();

    await runScheduledLater();

    expect(await keys(env.USER_AVATARS!)).toEqual(["user-avatars/keeper"]);
  });
});

describe("sweepUnreferencedObjects", () => {
  const later = () => new Date(Date.now() + 3 * 3_600_000);
  const attachments = () =>
    new R2StoryAttachmentObjectStore(env.STORY_ATTACHMENTS!);
  const references = () => new D1StoredObjectReferenceRepository(env.DB);
  const target = (
    findReferencedKeys: ObjectSweepTarget["findReferencedKeys"] = (found) =>
      references().findReferencedAttachmentKeys(found),
  ): ObjectSweepTarget => ({
    scope: "story-attachments",
    store: attachments(),
    findReferencedKeys,
  });
  const sweep = (
    overrides: Partial<ObjectSweepOptions> = {},
    sweepTarget = target(),
  ) =>
    sweepUnreferencedObjects(
      sweepTarget,
      new D1ObjectSweepCursorRepository(env.DB),
      { now: later(), pageSize: 1000, maxPages: 3, ...overrides },
    );

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await emptyBuckets();
  });

  it("keeps objects still within the upload grace period", async () => {
    await env.STORY_ATTACHMENTS!.put("story-attachments/orphan", "x");

    const summary = await sweep({ now: new Date() });

    expect(summary.deleted).toBe(0);
    expect(await keys(env.STORY_ATTACHMENTS!)).toHaveLength(1);
  });

  it("deletes nothing when D1 cannot confirm the references", async () => {
    await env.STORY_ATTACHMENTS!.put("story-attachments/orphan", "x");

    const summary = await sweep(
      {},
      target(async () => err(STORED_OBJECT_REFERENCE_REPOSITORY_ERROR)),
    );

    expect(summary.errors).toEqual(["reference lookup failed"]);
    expect(await keys(env.STORY_ATTACHMENTS!)).toHaveLength(1);
  });

  it("leaves other prefixes of a shared bucket alone", async () => {
    await env.STORY_ATTACHMENTS!.put("story-attachments/orphan", "x");
    await env.STORY_ATTACHMENTS!.put("user-avatars/someone", "x");
    await env.STORY_ATTACHMENTS!.put("unrelated", "x");

    await sweep();

    expect(await keys(env.STORY_ATTACHMENTS!)).toEqual([
      "unrelated",
      "user-avatars/someone",
    ]);
  });

  it("reaches the end over several runs and then starts over", async () => {
    const { project } = await seedProjectWithAttachment("Kept");
    for (const name of ["0", "y", "z"]) {
      await env.STORY_ATTACHMENTS!.put(`story-attachments/${name}`, "x");
    }

    const runs = [];
    for (let run = 0; run < 4; run += 1) {
      runs.push((await sweep({ pageSize: 1, maxPages: 1 })).deleted);
    }

    expect(runs).toEqual([1, 0, 1, 1]);
    expect(await keys(env.STORY_ATTACHMENTS!)).toEqual([
      expect.stringContaining(`story-attachments/${project.id}/`),
    ]);

    await env.STORY_ATTACHMENTS!.put("story-attachments/0", "x");
    expect((await sweep({ pageSize: 1, maxPages: 1 })).deleted).toBe(1);
  });

  it("checks a full page of keys in one run", async () => {
    const orphans = Array.from(
      { length: 150 },
      (_, index) => `story-attachments/orphan-${index}`,
    );
    await Promise.all(
      orphans.map((key) => env.STORY_ATTACHMENTS!.put(key, "x")),
    );

    const summary = await sweep();

    expect(summary).toMatchObject({ deleted: 150, errors: [] });
  });
});
