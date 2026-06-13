import { Hono } from "hono";
import type { Env } from "../../index";
import { D1ProjectApiKeyRepository } from "../../infrastructure/db/repositories/d1-project-api-key-repository";
import { issueProjectApiKey } from "../../application/usecases/issue-project-api-key";
import {
  revokeProjectApiKey,
  API_KEY_NOT_FOUND_ERROR,
  API_KEY_PROJECT_MISMATCH_ERROR,
} from "../../application/usecases/revoke-project-api-key";
import { listProjectApiKeys } from "../../application/usecases/list-project-api-keys";
import { requireProjectMembership } from "./project-membership";
import {
  API_KEY_NAME_REQUIRED_ERROR,
  API_KEY_INVALID_SCOPE_ERROR,
} from "../../application/usecases/issue-project-api-key";

export const projectApiKeysRoute = new Hono<Env>();

projectApiKeysRoute.get("/projects/:projectId/api-keys", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  if (membership.member.role !== "owner") {
    return c.json({ error: "Only project owners can manage API keys." }, 403);
  }

  const repository = new D1ProjectApiKeyRepository(c.env.DB);
  const result = await listProjectApiKeys(repository, { projectId });
  if (result.isErr()) {
    return c.json({ error: "Failed to load API keys" }, 500);
  }

  return c.json({ apiKeys: result.value });
});

projectApiKeysRoute.post("/projects/:projectId/api-keys", async (c) => {
  const projectId = c.req.param("projectId");
  const currentUser = c.get("currentUser");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  if (membership.member.role !== "owner") {
    return c.json({ error: "Only project owners can issue API keys." }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("name" in body) ||
    typeof (body as { name: unknown }).name !== "string"
  ) {
    return c.json({ error: "name is required" }, 400);
  }

  const payload = body as { name: string; scopes?: unknown };
  const scopes = Array.isArray(payload.scopes)
    ? (payload.scopes as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : ["story:write"];

  const repository = new D1ProjectApiKeyRepository(c.env.DB);
  const result = await issueProjectApiKey(repository, {
    projectId,
    name: payload.name,
    scopes,
    ownerUserId: currentUser.id,
  });

  if (result.isErr()) {
    if (result.error === API_KEY_NAME_REQUIRED_ERROR) {
      return c.json({ error: "name is required" }, 400);
    }
    if (result.error === API_KEY_INVALID_SCOPE_ERROR) {
      return c.json(
        { error: "Invalid scope. Valid scopes: story:write, story:read" },
        400,
      );
    }
    return c.json({ error: "Failed to issue API key" }, 500);
  }

  c.header("Cache-Control", "no-store");
  return c.json(
    { apiKey: result.value.apiKey, rawKey: result.value.rawKey },
    201,
  );
});

projectApiKeysRoute.delete(
  "/projects/:projectId/api-keys/:keyId",
  async (c) => {
    const projectId = c.req.param("projectId");
    const keyId = c.req.param("keyId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    if (membership.member.role !== "owner") {
      return c.json({ error: "Only project owners can revoke API keys." }, 403);
    }

    const repository = new D1ProjectApiKeyRepository(c.env.DB);
    const result = await revokeProjectApiKey(repository, { projectId, keyId });
    if (result.isErr()) {
      if (result.error === API_KEY_NOT_FOUND_ERROR) {
        return c.json({ error: "API key not found" }, 404);
      }
      if (result.error === API_KEY_PROJECT_MISMATCH_ERROR) {
        return c.json({ error: "API key not found" }, 404);
      }
      return c.json({ error: "Failed to revoke API key" }, 500);
    }

    return c.json({ apiKey: result.value });
  },
);
