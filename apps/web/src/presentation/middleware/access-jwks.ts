import type { Bindings } from "../../index";
import { ACCESS_CERTS_PATH, resolveAccessUrl } from "../cloudflare-access";
import type { AccessJwk } from "./access-jwt";

type JwkSet = {
  keys: AccessJwk[];
};

type CachedJwkSet = {
  expiresAt: number;
  keys: AccessJwk[];
};

const JWK_CACHE_TTL_MS = 5 * 60 * 1000;
const jwkCache = new Map<string, CachedJwkSet>();

export const loadJwks = async (
  bindings: Pick<Bindings, "ACCESS_JWKS_JSON" | "ACCESS_TEAM_DOMAIN">,
): Promise<AccessJwk[]> => {
  if (bindings.ACCESS_JWKS_JSON) {
    const parsed = JSON.parse(bindings.ACCESS_JWKS_JSON) as JwkSet;
    return parsed.keys;
  }

  const teamDomain = bindings.ACCESS_TEAM_DOMAIN;
  if (!teamDomain) {
    throw new Error("ACCESS_TEAM_DOMAIN is not configured");
  }

  const cached = jwkCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const response = await fetch(resolveAccessUrl(teamDomain, ACCESS_CERTS_PATH));
  if (!response.ok) {
    throw new Error(`Failed to fetch Access certs: ${response.status}`);
  }

  const jwkSet = (await response.json()) as JwkSet;
  jwkCache.set(teamDomain, {
    expiresAt: Date.now() + JWK_CACHE_TTL_MS,
    keys: jwkSet.keys,
  });

  return jwkSet.keys;
};
