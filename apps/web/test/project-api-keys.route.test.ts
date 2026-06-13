import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

describe("project api keys management routes", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  const fetchWithAuth = async (
    url: string,
    init: RequestInit = {},
    overrides?: Parameters<typeof createAuthHeaders>[0],
  ) => {
    const headers = new Headers(init.headers);
    const authHeaders = await createAuthHeaders(overrides);
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }
    return SELF.fetch(url, { ...init, headers });
  };

  const createProject = async (
    overrides?: Parameters<typeof createAuthHeaders>[0],
  ) => {
    const response = await fetchWithAuth(
      "http://localhost/api/projects",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "API Key Test Project" }),
      },
      overrides,
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { project: { id: string } };
    return payload.project.id;
  };

  it("owner can issue an API key", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/api-keys`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "CI Key", scopes: ["story:write"] }),
      },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      apiKey: {
        id: string;
        name: string;
        keyPrefix: string;
        scopes: string[];
        revokedAt: string | null;
      };
      rawKey: string;
    };
    expect(body.apiKey.name).toBe("CI Key");
    expect(body.apiKey.scopes).toEqual(["story:write"]);
    expect(body.apiKey.revokedAt).toBeNull();
    expect(body.rawKey).toMatch(/^sk_[0-9a-f]{64}$/);
  });

  it("non-member user cannot issue an API key", async () => {
    const ownerSub = "owner-user-id";
    const otherSub = "other-user-id";

    const projectId = await createProject({ sub: ownerSub });

    // Other user (not a member) tries to issue API key
    const response = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/api-keys`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Other Key", scopes: ["story:write"] }),
      },
      { sub: otherSub },
    );

    expect(response.status).toBe(403);
  });

  it("member (non-owner) cannot issue an API key", async () => {
    const ownerSub = "owner-user-id";
    const memberSub = "member-user-id";

    const projectId = await createProject({ sub: ownerSub });

    // Owner invites member by userId
    const inviteResponse = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/invitations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: memberSub, role: "member" }),
      },
      { sub: ownerSub },
    );
    expect(inviteResponse.status).toBe(201);
    const invitePayload = (await inviteResponse.json()) as {
      invitation: { id: string };
    };

    // Member accepts invitation
    await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/invitations/${invitePayload.invitation.id}/accept`,
      { method: "POST" },
      { sub: memberSub },
    );

    // Member tries to issue API key
    const response = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/api-keys`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Member Key", scopes: ["story:write"] }),
      },
      { sub: memberSub },
    );

    expect(response.status).toBe(403);
  });

  it("owner can list API keys", async () => {
    const projectId = await createProject();

    // Issue a key first
    await fetchWithAuth(`http://localhost/api/projects/${projectId}/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Listed Key", scopes: ["story:write"] }),
    });

    const response = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/api-keys`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      apiKeys: Array<{ id: string; name: string }>;
    };
    expect(Array.isArray(body.apiKeys)).toBe(true);
    expect(body.apiKeys.length).toBeGreaterThan(0);
    expect(body.apiKeys[0]).not.toHaveProperty("rawKey");
    expect(body.apiKeys.some((k) => k.name === "Listed Key")).toBe(true);
  });

  it("owner can revoke an API key", async () => {
    const projectId = await createProject();

    const issueResponse = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/api-keys`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "To Revoke", scopes: ["story:write"] }),
      },
    );
    const issueBody = (await issueResponse.json()) as {
      apiKey: { id: string };
    };

    const revokeResponse = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/api-keys/${issueBody.apiKey.id}`,
      { method: "DELETE" },
    );

    expect(revokeResponse.status).toBe(200);
  });
});
