import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../../index";
import { jwtVerify, type JWTPayload } from "jose";
import { resolveAccessUrl } from "../cloudflare-access";
import { resolveAccessJwks } from "./access-jwks";

export type AccessJwtPayload = {
  aud?: string | string[];
  exp?: number;
  sub?: string;
  email?: string;
};

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

  const expectedAudience = bindings.ACCESS_AUD;
  if (!expectedAudience) {
    throw new Error("ACCESS_AUD is not configured");
  }
  const teamDomain = bindings.ACCESS_TEAM_DOMAIN;
  if (!teamDomain) {
    throw new Error("ACCESS_TEAM_DOMAIN is not configured");
  }

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, resolveAccessJwks(bindings), {
      algorithms: ["RS256"],
      audience: expectedAudience,
      issuer: resolveAccessUrl(teamDomain, ""),
      requiredClaims: ["exp", "sub"],
    }));
  } catch {
    // 署名・claims 不正と JWKS 取得失敗はいずれも認証拒否として扱う
    return null;
  }

  if (typeof payload.sub !== "string" || payload.sub === "") {
    return null;
  }

  return {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    claims: payload as AccessJwtPayload,
  };
}

const onAuthFailure = (c: Context<Env>, options: AccessAuthOptions) => {
  if (options.redirectOnFailure && c.req.method === "GET") {
    return c.redirect(options.redirectPath ?? "/login", 302);
  }

  return c.json({ error: "Unauthorized" }, 401);
};
