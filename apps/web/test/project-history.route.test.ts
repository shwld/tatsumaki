import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

function historyApiPath(projectId: string): string {
  return `http://localhost/api/projects/${projectId}/history`;
}

describe("project history routes", () => {
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

  const createProject = async () => {
    const response = await fetchWithAuth("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Hist Project" }),
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { project: { id: string } };
    return payload.project.id;
  };

  it("returns paged history with hasMore and nextCursor", async () => {
    const projectId = await createProject();
    const res = await fetchWithAuth(`${historyApiPath(projectId)}?limit=10`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      history: unknown[];
      hasMore: boolean;
      nextCursor: string | null;
    };
    expect(Array.isArray(body.history)).toBe(true);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("rejects invalid history cursor", async () => {
    const projectId = await createProject();
    const res = await fetchWithAuth(
      `${historyApiPath(projectId)}?before=not-a-cursor`,
    );
    expect(res.status).toBe(400);
  });
});
