import type { MiddlewareHandler } from "hono";
import type { Env } from "../../index";
import { D1ProjectApiKeyRepository } from "../../infrastructure/db/repositories/d1-project-api-key-repository";
import { hashApiKey } from "../../application/services/api-key-hasher";

export const API_KEY_HEADER = "X-Api-Key";
const API_KEY_FORMAT = /^sk_[0-9a-f]{64}$/;

declare module "hono" {
  interface ContextVariableMap {
    apiKeyScopes: string[];
    apiKeyId: string;
    apiKeyName: string;
    apiKeyProjectId: string;
  }
}

export function requireApiKeyAuth(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const rawKey = c.req.header(API_KEY_HEADER);
    if (!rawKey || !API_KEY_FORMAT.test(rawKey)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const keyHash = await hashApiKey(rawKey);
    const repository = new D1ProjectApiKeyRepository(c.env.DB);
    const result = await repository.findByHash(keyHash);

    if (result.isErr() || !result.value) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const apiKey = result.value;

    c.set("currentUser", { id: apiKey.ownerUserId });
    c.set("apiKeyScopes", apiKey.scopes);
    c.set("apiKeyId", apiKey.id);
    c.set("apiKeyName", apiKey.name);
    c.set("apiKeyProjectId", apiKey.projectId);

    c.executionCtx.waitUntil(
      repository.touchLastUsed(apiKey.id, new Date().toISOString()),
    );

    await next();
  };
}

export function requireApiKeyScope(scope: string): MiddlewareHandler<Env> {
  return async (c, next) => {
    const scopes = c.get("apiKeyScopes") ?? [];
    if (!scopes.includes(scope)) {
      return c.json({ error: "Forbidden: insufficient scope" }, 403);
    }
    await next();
  };
}
