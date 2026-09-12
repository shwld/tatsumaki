import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAccessJwt,
  createAuthHeaders,
  setupAccessBindings,
} from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { createDb } from "../src/infrastructure/db/client";
import {
  projectInvitationsTable,
  usersTable,
} from "../src/infrastructure/db/schema";
import { eq } from "drizzle-orm";

async function accessHeaders(sub: string, email: string) {
  return { "Cf-Access-Jwt-Assertion": await createAccessJwt({ sub, email }) };
}

async function createProjectAndLink() {
  const ownerHeaders = await createAuthHeaders();
  const projectResponse = await SELF.fetch("https://localhost/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json", ...ownerHeaders },
    body: JSON.stringify({ name: "Invite Link Project" }),
  });
  const { project } = (await projectResponse.json()) as {
    project: { id: string };
  };
  const linkResponse = await SELF.fetch(
    `https://localhost/api/projects/${project.id}/invitation-links`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...ownerHeaders },
      body: JSON.stringify({ role: "member" }),
    },
  );
  expect(linkResponse.status).toBe(201);
  const body = (await linkResponse.json()) as {
    invitation: { id: string };
    url: string;
  };
  return {
    ownerHeaders,
    projectId: project.id,
    invitationId: body.invitation.id,
    token: new URL(body.url).hash.slice(1),
  };
}

describe("single-use invitation links", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  it("stores only the token hash and atomically bootstraps the first user", async () => {
    const { projectId, invitationId, token } = await createProjectAndLink();
    const stored = await createDb(env.DB)
      .select()
      .from(projectInvitationsTable)
      .where(eq(projectInvitationsTable.id, invitationId))
      .get();
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored).toMatchObject({ targetUserId: null, targetEmail: null });

    const response = await SELF.fetch(
      "https://localhost/api/invitation-links/accept",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await accessHeaders("github|new-user", "new@example.com")),
        },
        body: JSON.stringify({ token }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ projectId });

    const user = await createDb(env.DB)
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, "github|new-user"))
      .get();
    expect(user?.accessStatus).toBe("allowed");

    const listResponse = await SELF.fetch("https://localhost/api/projects", {
      headers: await accessHeaders("github|new-user", "new@example.com"),
    });
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      projects: [{ id: projectId, currentUserRole: "member" }],
    });
  });

  it("allows exactly one of concurrent acceptances", async () => {
    const { token } = await createProjectAndLink();
    const accept = async (sub: string) =>
      SELF.fetch("https://localhost/api/invitation-links/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await accessHeaders(sub, `${sub}@example.com`)),
        },
        body: JSON.stringify({ token }),
      });
    const responses = await Promise.all([accept("first"), accept("second")]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 410,
    ]);
  });

  it("rejects revoked links", async () => {
    const { ownerHeaders, projectId, invitationId, token } =
      await createProjectAndLink();
    const revoke = await SELF.fetch(
      `https://localhost/api/projects/${projectId}/invitation-links/${invitationId}`,
      { method: "DELETE", headers: ownerHeaders },
    );
    expect(revoke.status).toBe(200);

    const accept = await SELF.fetch(
      "https://localhost/api/invitation-links/accept",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await accessHeaders("revoked-user", "revoked@example.com")),
        },
        body: JSON.stringify({ token }),
      },
    );
    expect(accept.status).toBe(410);
  });

  it("rejects expired links without creating a user", async () => {
    const { invitationId, token } = await createProjectAndLink();
    await createDb(env.DB)
      .update(projectInvitationsTable)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(projectInvitationsTable.id, invitationId));

    const accept = await SELF.fetch(
      "https://localhost/api/invitation-links/accept",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await accessHeaders("expired-user", "expired@example.com")),
        },
        body: JSON.stringify({ token }),
      },
    );
    expect(accept.status).toBe(410);
    expect(
      await createDb(env.DB)
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, "expired-user"))
        .get(),
    ).toBeUndefined();
  });

  it("keeps targeted invitations usable for a first-time user", async () => {
    const ownerHeaders = await createAuthHeaders();
    const projectResponse = await SELF.fetch("https://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json", ...ownerHeaders },
      body: JSON.stringify({ name: "Targeted Invite" }),
    });
    const { project } = (await projectResponse.json()) as {
      project: { id: string };
    };
    const inviteResponse = await SELF.fetch(
      `https://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({ email: "target@example.com", role: "viewer" }),
      },
    );
    const { invitation } = (await inviteResponse.json()) as {
      invitation: { id: string };
    };

    const targetHeaders = await accessHeaders(
      "target-user",
      "target@example.com",
    );
    const acceptPage = await SELF.fetch(
      `https://localhost/projects/${project.id}/invitations/${invitation.id}/accept`,
      { headers: targetHeaders },
    );
    expect(acceptPage.status).not.toBe(403);

    const wrongRevoke = await SELF.fetch(
      `https://localhost/api/projects/${project.id}/invitation-links/${invitation.id}`,
      { method: "DELETE", headers: ownerHeaders },
    );
    expect(wrongRevoke.status).toBe(404);

    const accept = await SELF.fetch(
      `https://localhost/api/projects/${project.id}/invitations/${invitation.id}/accept`,
      {
        method: "POST",
        headers: targetHeaders,
      },
    );
    expect(accept.status).toBe(200);
    const user = await createDb(env.DB)
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, "target-user"))
      .get();
    expect(user?.accessStatus).toBe("allowed");
  });

  it("blocks uninvited users from browser, API, CLI, and OAuth entry points", async () => {
    const headers = await accessHeaders("uninvited", "uninvited@example.com");
    expect(
      (await SELF.fetch("https://localhost/api/projects", { headers })).status,
    ).toBe(403);
    expect(
      (
        await SELF.fetch("https://localhost/programmatic-api/v1/whoami", {
          headers,
        })
      ).status,
    ).toBeOneOf([401, 403]);
    expect(
      (await SELF.fetch("https://localhost/projects", { headers })).status,
    ).toBe(403);
    const invitePage = await SELF.fetch("https://localhost/invite", {
      headers,
    });
    expect(invitePage.status).not.toBe(403);
    expect(invitePage.headers.get("referrer-policy")).toBe("no-referrer");
    expect(
      (
        await SELF.fetch(
          "https://localhost/oauth/authorize?response_type=code&client_id=x&redirect_uri=https%3A%2F%2Fexample.com&scope=mcp&state=x&code_challenge=x&code_challenge_method=S256",
          { headers },
        )
      ).status,
    ).toBe(403);
  });
});
