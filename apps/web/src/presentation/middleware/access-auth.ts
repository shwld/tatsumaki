import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../../index";
import {
  decodeJsonSegment,
  hasExpectedAudience,
  isTokenActive,
  selectJwk,
  verifyRs256Signature,
  type AccessJwtHeader,
  type AccessJwtPayload,
} from "./access-jwt";
import { loadJwks } from "./access-jwks";

type AccessAuthOptions = {
  redirectOnFailure?: boolean;
  redirectPath?: string;
};

export const JWT_HEADER_NAME = "Cf-Access-Jwt-Assertion";

export type CurrentUser = {
  id: string;
  email?: string;
  claims?: AccessJwtPayload;
};

declare module "hono" {
  interface ContextVariableMap {
    currentUser: CurrentUser;
  }
}

export const requireAccessAuth = (
  options: AccessAuthOptions = {},
): MiddlewareHandler<Env> => {
  return async (c, next) => {
    try {
      const currentUser = await getCurrentUserFromAccessRequest(
        c.req.raw,
        c.env,
      );
      if (!currentUser) {
        return onAuthFailure(c, options);
      }
      c.set("currentUser", currentUser);

      await next();
    } catch {
      return onAuthFailure(c, options);
    }
  };
};

export async function getCurrentUserFromAccessRequest(
  request: Request,
  bindings: Env["Bindings"],
): Promise<CurrentUser | null> {
  const token = request.headers.get(JWT_HEADER_NAME);
  if (!token) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }

  const header = decodeJsonSegment<AccessJwtHeader>(encodedHeader);
  const payload = decodeJsonSegment<AccessJwtPayload>(encodedPayload);

  if (header.alg !== "RS256") {
    return null;
  }

  const expectedAudience = bindings.ACCESS_AUD;
  if (!expectedAudience) {
    throw new Error("ACCESS_AUD is not configured");
  }

  const jwks = await loadJwks(bindings);
  const verificationKey = selectJwk(jwks, header.kid);
  if (!verificationKey) {
    return null;
  }

  const validSignature = await verifyRs256Signature(
    `${encodedHeader}.${encodedPayload}`,
    encodedSignature,
    verificationKey,
  );
  if (!validSignature) {
    return null;
  }

  if (!hasExpectedAudience(payload.aud, expectedAudience)) {
    return null;
  }

  if (!isTokenActive(payload.exp) || !payload.sub) {
    return null;
  }

  return {
    id: payload.sub,
    email: payload.email,
    claims: payload,
  };
}

const onAuthFailure = (c: Context<Env>, options: AccessAuthOptions) => {
  if (options.redirectOnFailure && c.req.method === "GET") {
    return c.redirect(options.redirectPath ?? "/login", 302);
  }

  return c.json({ error: "Unauthorized" }, 401);
};
