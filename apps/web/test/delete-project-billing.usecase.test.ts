import { env } from "cloudflare:test";
import { err } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_DELETE_FORBIDDEN_ERROR,
  PROJECT_DELETE_PENDING_ERROR,
  PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR,
  deleteProject,
  recoverProjectDeletions,
} from "../src/application/usecases/delete-project";
import { D1ProjectDeletionRequestRepository } from "../src/infrastructure/db/repositories/d1-project-deletion-request-repository";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { resetDatabase } from "./helpers/db";

const seedProject = async (name = "Billing Target") => {
  const result = await new D1ProjectRepository(env.DB).create({
    name,
    ownerUserId: "owner",
  });
  if (result.isErr()) throw new Error("seed failed");
  return result.value;
};

const setup = () => {
  const repository = new D1ProjectRepository(env.DB);
  const requests = new D1ProjectDeletionRequestRepository(env.DB);
  const recordProjectDeleted = vi.fn<
    (input: { projectId: string }) => Promise<void>
  >(async () => undefined);
  const deps = {
    repository,
    notifications: { requests, gateway: { recordProjectDeleted } },
  };
  const exists = async (projectId: string) =>
    (await repository.findById(projectId))._unsafeUnwrap() !== null;
  const pendingRequest = async (projectId: string) =>
    (await requests.findById(projectId))._unsafeUnwrap();
  return { deps, recordProjectDeleted, exists, pendingRequest };
};

describe("deleteProject with notifications", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("ends only this project's notifications, then deletes it and clears the request", async () => {
    const project = await seedProject();
    const { deps, recordProjectDeleted, exists, pendingRequest } = setup();

    const result = await deleteProject(deps, {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Billing Target",
    });

    expect(result.isOk()).toBe(true);
    expect(recordProjectDeleted).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
    });
    expect(await exists(project.id)).toBe(false);
    expect(await pendingRequest(project.id)).toBeNull();
  });

  it("rejects a request from a user demoted by an ownership transfer, without any notifications call", async () => {
    const project = await seedProject();
    await env.DB.prepare(
      "UPDATE project_members SET role = 'member' WHERE project_id = ?1 AND user_id = 'owner'",
    )
      .bind(project.id)
      .run();
    const { deps, recordProjectDeleted, exists, pendingRequest } = setup();

    const result = await deleteProject(deps, {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Billing Target",
    });

    expect(result._unsafeUnwrapErr()).toBe(PROJECT_DELETE_FORBIDDEN_ERROR);
    expect(recordProjectDeleted).not.toHaveBeenCalled();
    expect(await exists(project.id)).toBe(true);
    expect(await pendingRequest(project.id)).toBeNull();
  });

  it("does not let a demoted user ride on a request opened by the new owner", async () => {
    const project = await seedProject();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE project_members SET role = 'member' WHERE project_id = ?1 AND user_id = 'owner'",
      ).bind(project.id),
      env.DB.prepare(
        "INSERT INTO project_members (project_id, user_id, role) VALUES (?1, 'new-owner', 'owner')",
      ).bind(project.id),
    ]);
    const { deps, recordProjectDeleted } = setup();
    await deps.notifications.requests.open({
      projectId: project.id,
      requestedByUserId: "new-owner",
    });

    const result = await deleteProject(deps, {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Billing Target",
    });

    expect(result._unsafeUnwrapErr()).toBe(PROJECT_DELETE_FORBIDDEN_ERROR);
    expect(recordProjectDeleted).not.toHaveBeenCalled();
  });

  it("reports not found when a concurrent deletion removed the project before the request opened", async () => {
    const project = await seedProject();
    const { deps, recordProjectDeleted } = setup();
    const realOpen = deps.notifications.requests.open.bind(
      deps.notifications.requests,
    );
    deps.notifications.requests.open = async (input) => {
      await deps.repository.delete(input.projectId);
      return realOpen(input);
    };

    const result = await deleteProject(deps, {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Billing Target",
    });

    expect(result._unsafeUnwrapErr()).toBe("PROJECT_NOT_FOUND_ERROR");
    expect(recordProjectDeleted).not.toHaveBeenCalled();
  });

  it("changes neither notifications nor data when the name does not match", async () => {
    const project = await seedProject();
    const { deps, recordProjectDeleted, exists, pendingRequest } = setup();

    const result = await deleteProject(deps, {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Wrong",
    });

    expect(result._unsafeUnwrapErr()).toBe(
      PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR,
    );
    expect(recordProjectDeleted).not.toHaveBeenCalled();
    expect(await exists(project.id)).toBe(true);
    expect(await pendingRequest(project.id)).toBeNull();
  });

  it("deletes the project and keeps its notification pending when the provider is down", async () => {
    const project = await seedProject();
    const { deps, recordProjectDeleted, exists, pendingRequest } = setup();
    recordProjectDeleted.mockRejectedValueOnce(new Error("cp down"));

    const result = await deleteProject(deps, {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Billing Target",
    });

    expect(result._unsafeUnwrapErr()).toBe(PROJECT_DELETE_PENDING_ERROR);
    expect(await exists(project.id)).toBe(false);
    expect(await pendingRequest(project.id)).toMatchObject({
      projectId: project.id,
      requestedByUserId: "owner",
      attemptCount: 1,
    });
  });

  it("completes on retry after a failure without a second request", async () => {
    const project = await seedProject();
    const { deps, recordProjectDeleted, exists, pendingRequest } = setup();
    recordProjectDeleted.mockRejectedValueOnce(new Error("cp down"));
    const input = {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Billing Target",
    };
    await deleteProject(deps, input);

    expect(await recoverProjectDeletions(deps)).toMatchObject({ completed: 1 });
    expect(recordProjectDeleted).toHaveBeenCalledTimes(2);
    expect(await exists(project.id)).toBe(false);
    expect(await pendingRequest(project.id)).toBeNull();
  });

  it("reports a persisted request as pending when the database delete fails after notifications ended", async () => {
    const project = await seedProject();
    const { deps, exists, pendingRequest } = setup();
    deps.repository.delete = async () => {
      throw new Error("d1 down");
    };

    const result = await deleteProject(deps, {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Billing Target",
    });

    expect(result._unsafeUnwrapErr()).toBe(PROJECT_DELETE_PENDING_ERROR);
    expect(await exists(project.id)).toBe(true);
    expect(await pendingRequest(project.id)).toMatchObject({ attemptCount: 1 });
  });

  it("does not report acceptance when the request cannot be persisted", async () => {
    const project = await seedProject();
    const { deps, recordProjectDeleted, exists } = setup();
    deps.notifications.requests.open = async () =>
      err("PROJECT_DELETION_REQUEST_REPOSITORY_ERROR");

    const result = await deleteProject(deps, {
      projectId: project.id,
      userId: "owner",
      confirmProjectName: "Billing Target",
    });

    expect(result._unsafeUnwrapErr()).toBe("PROJECT_REPOSITORY_ERROR");
    expect(recordProjectDeleted).not.toHaveBeenCalled();
    expect(await exists(project.id)).toBe(true);
  });

  it("deletes without any notifications call for self-hosted deployments", async () => {
    const project = await seedProject();
    const repository = new D1ProjectRepository(env.DB);

    const result = await deleteProject(
      { repository },
      {
        projectId: project.id,
        userId: "owner",
        confirmProjectName: "Billing Target",
      },
    );

    expect(result.isOk()).toBe(true);
    expect((await repository.findById(project.id))._unsafeUnwrap()).toBeNull();
  });
});

describe("recoverProjectDeletions", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("finishes a request left behind by a crash before the Control Plane call", async () => {
    const project = await seedProject();
    const { deps, recordProjectDeleted, exists, pendingRequest } = setup();
    await deps.notifications.requests.open({
      projectId: project.id,
      requestedByUserId: "owner",
    });

    const summary = await recoverProjectDeletions(deps);

    expect(summary).toEqual({ examined: 1, completed: 1, stillPending: 0 });
    expect(recordProjectDeleted).toHaveBeenCalledOnce();
    expect(await exists(project.id)).toBe(false);
    expect(await pendingRequest(project.id)).toBeNull();
  });

  it("only clears the request when the project is already gone (crash after delete)", async () => {
    const project = await seedProject();
    const { deps, pendingRequest } = setup();
    await deps.notifications.requests.open({
      projectId: project.id,
      requestedByUserId: "owner",
    });
    await deps.repository.delete(project.id);

    const summary = await recoverProjectDeletions(deps);

    expect(summary.completed).toBe(1);
    expect(await pendingRequest(project.id)).toBeNull();
  });

  it("keeps the request while the Control Plane keeps failing, then converges", async () => {
    const project = await seedProject();
    const { deps, recordProjectDeleted, exists, pendingRequest } = setup();
    await deps.notifications.requests.open({
      projectId: project.id,
      requestedByUserId: "owner",
    });
    recordProjectDeleted.mockRejectedValue(new Error("cp down"));

    expect(await recoverProjectDeletions(deps)).toMatchObject({
      stillPending: 1,
    });
    expect(await exists(project.id)).toBe(false);
    expect(await pendingRequest(project.id)).toMatchObject({ attemptCount: 1 });

    recordProjectDeleted.mockResolvedValue(undefined);
    expect(await recoverProjectDeletions(deps)).toMatchObject({ completed: 1 });
    expect(await exists(project.id)).toBe(false);
  });

  it("keeps processing the rest of the batch when one request throws", async () => {
    const first = await seedProject("First");
    const second = await seedProject("Second");
    const { deps, exists, pendingRequest } = setup();
    for (const project of [first, second]) {
      await deps.notifications.requests.open({
        projectId: project.id,
        requestedByUserId: "owner",
      });
    }
    const realDelete = deps.repository.delete.bind(deps.repository);
    deps.repository.delete = async (projectId: string) => {
      if (projectId === first.id) throw new Error("d1 down");
      return realDelete(projectId);
    };

    const summary = await recoverProjectDeletions(deps);

    expect(summary).toMatchObject({
      examined: 2,
      completed: 1,
      stillPending: 1,
    });
    expect(await exists(first.id)).toBe(true);
    expect(await pendingRequest(first.id)).toMatchObject({ attemptCount: 1 });
    expect(await exists(second.id)).toBe(false);
  });

  it("rotates failing requests behind newer ones", async () => {
    const first = await seedProject("First");
    const second = await seedProject("Second");
    const { deps } = setup();
    await deps.notifications.requests.open({
      projectId: first.id,
      requestedByUserId: "owner",
    });
    await env.DB.prepare(
      "update project_deletion_requests set created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' where project_id = ?",
    )
      .bind(first.id)
      .run();
    await deps.notifications.requests.open({
      projectId: second.id,
      requestedByUserId: "owner",
    });
    await env.DB.prepare(
      "update project_deletion_requests set updated_at = '2020-06-01 00:00:00' where project_id = ?",
    )
      .bind(second.id)
      .run();
    await deps.notifications.requests.recordFailure(first.id, "cp down");

    const pending = (
      await deps.notifications.requests.listPending(1)
    )._unsafeUnwrap();

    expect(pending.map((request) => request.projectId)).toEqual([second.id]);
  });
});
