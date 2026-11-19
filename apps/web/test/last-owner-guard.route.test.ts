import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { LAST_PROJECT_OWNER_ERROR } from "../src/domain/repositories/project-repository";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { D1UserRepository } from "../src/infrastructure/db/repositories/d1-user-repository";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

const OWNER = "github|test-user";

const createProject = async () => {
  const response = await SELF.fetch("https://localhost/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await createAuthHeaders()),
    },
    body: JSON.stringify({ name: "Guarded Project" }),
  });
  const { project } = (await response.json()) as { project: { id: string } };
  return project.id;
};

const addMember = (projectId: string, userId: string, role: string) =>
  env.DB.prepare(
    "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
  )
    .bind(projectId, userId, role)
    .run();

const roleOf = async (projectId: string, userId: string) =>
  (
    await env.DB.prepare(
      "select role from project_members where project_id = ? and user_id = ?",
    )
      .bind(projectId, userId)
      .first<{ role: string }>()
  )?.role;

const ownerCount = async (projectId: string) =>
  (
    await env.DB.prepare(
      "select count(*) as n from project_members where project_id = ? and role = 'owner'",
    )
      .bind(projectId)
      .first<{ n: number }>()
  )?.n;

const patchRole = async (projectId: string, userId: string, role: string) =>
  SELF.fetch(`https://localhost/api/projects/${projectId}/members/${userId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(await createAuthHeaders()),
    },
    body: JSON.stringify({ role }),
  });

describe("last owner guard", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  it("rejects demoting the sole owner with 409 and keeps the role", async () => {
    const projectId = await createProject();

    const response = await patchRole(projectId, OWNER, "viewer");

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "last_project_owner" });
    expect(await roleOf(projectId, OWNER)).toBe("owner");
  });

  it("allows demoting an owner when another owner exists", async () => {
    const projectId = await createProject();
    await addMember(projectId, "github|second-owner", "owner");

    const response = await patchRole(projectId, OWNER, "viewer");

    expect(response.status).toBe(200);
    expect(await roleOf(projectId, OWNER)).toBe("viewer");
    expect(await ownerCount(projectId)).toBe(1);
  });

  it("allows the sole owner to keep the owner role", async () => {
    const projectId = await createProject();

    const response = await patchRole(projectId, OWNER, "owner");

    expect(response.status).toBe(200);
  });

  it("keeps the 404 for a missing member", async () => {
    const projectId = await createProject();

    const response = await patchRole(projectId, "github|nobody", "viewer");

    expect(response.status).toBe(404);
  });

  it("never leaves zero owners when two owners are demoted concurrently", async () => {
    const projectId = await createProject();
    await addMember(projectId, "github|second-owner", "owner");
    const repository = new D1ProjectRepository(env.DB);

    const results = await Promise.all([
      repository.updateMemberRole({
        projectId,
        userId: OWNER,
        role: "viewer",
      }),
      repository.updateMemberRole({
        projectId,
        userId: "github|second-owner",
        role: "viewer",
      }),
    ]);

    expect(await ownerCount(projectId)).toBe(1);
    expect(
      results.filter((r) => r.isErr() && r.error === LAST_PROJECT_OWNER_ERROR),
    ).toHaveLength(1);
  });

  it("does not overwrite the existing role when a targeted invitation is accepted", async () => {
    const projectId = await createProject();
    const inviteResponse = await SELF.fetch(
      `https://localhost/api/projects/${projectId}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({ userId: OWNER, role: "viewer" }),
      },
    );
    const { invitation } = (await inviteResponse.json()) as {
      invitation: { id: string };
    };

    const acceptResponse = await SELF.fetch(
      `https://localhost/api/projects/${projectId}/invitations/${invitation.id}/accept`,
      {
        method: "POST",
        headers: await createAuthHeaders(),
      },
    );

    expect(acceptResponse.status).toBe(200);
    expect(await roleOf(projectId, OWNER)).toBe("owner");
    expect(await ownerCount(projectId)).toBe(1);
  });

  it("does not remove a sole-owner membership when the account is deleted", async () => {
    const projectId = await createProject();
    await createAuthHeaders();

    await new D1UserRepository(env.DB).delete(OWNER);

    expect(await roleOf(projectId, OWNER)).toBe("owner");
  });

  it("removes an owner membership on account deletion when another owner exists", async () => {
    const projectId = await createProject();
    await addMember(projectId, "github|second-owner", "owner");

    await new D1UserRepository(env.DB).delete(OWNER);

    expect(await roleOf(projectId, OWNER)).toBeUndefined();
    expect(await ownerCount(projectId)).toBe(1);
  });
});
