import {
  createLocalJWKSet,
  createRemoteJWKSet,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";
import type { Bindings } from "../../index";
import { ACCESS_CERTS_PATH, resolveAccessUrl } from "../cloudflare-access";

// 未知の kid は cooldown 経過後に再取得する。鍵切替直後の正規トークンを
// キャッシュ TTL まで拒否せず、不正 kid の連投では取得頻度を cooldown で抑える。
const JWKS_COOLDOWN_MS = 30 * 1000;
const JWKS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5 * 1000;

// jose 単体では同時多発の未知 kid で取得が増幅するため cooldown を自前で掛ける
const withFetchGate = (
  remote: ReturnType<typeof createRemoteJWKSet>,
): JWTVerifyGetKey => {
  let lastFetchAt = Number.NEGATIVE_INFINITY;
  return async (protectedHeader, token) => {
    const kid = protectedHeader.kid;
    const known =
      kid !== undefined &&
      (remote.jwks()?.keys.some((key) => key.kid === kid) ?? false);
    if (!(remote.fresh && known)) {
      const now = Date.now();
      if (now - lastFetchAt < JWKS_COOLDOWN_MS) {
        throw new Error("Access JWKS refresh is cooling down");
      }
      lastFetchAt = now;
      await remote.reload();
    }
    return remote(protectedHeader, token);
  };
};

const remoteJwksByTeamDomain = new Map<string, JWTVerifyGetKey>();

export const resolveAccessJwks = (
  bindings: Pick<Bindings, "ACCESS_JWKS_JSON" | "ACCESS_TEAM_DOMAIN">,
): JWTVerifyGetKey => {
  if (bindings.ACCESS_JWKS_JSON) {
    return createLocalJWKSet(
      JSON.parse(bindings.ACCESS_JWKS_JSON) as JSONWebKeySet,
    );
  }

  const teamDomain = bindings.ACCESS_TEAM_DOMAIN;
  if (!teamDomain) {
    throw new Error("ACCESS_TEAM_DOMAIN is not configured");
  }

  let resolver = remoteJwksByTeamDomain.get(teamDomain);
  if (!resolver) {
    resolver = withFetchGate(
      createRemoteJWKSet(
        new URL(resolveAccessUrl(teamDomain, ACCESS_CERTS_PATH)),
        {
          cooldownDuration: JWKS_COOLDOWN_MS,
          cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
          timeoutDuration: JWKS_FETCH_TIMEOUT_MS,
        },
      ),
    );
    remoteJwksByTeamDomain.set(teamDomain, resolver);
  }
  return resolver;
};
