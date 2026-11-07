import { getDomain } from "tldts";
import type { Bindings } from "../../../index";

type PreviewPolicyEnv = Pick<
  Bindings,
  "ENTITLEMENT_MODE" | "ARTIFACT_CONTENT_ORIGIN" | "ARTIFACT_APP_ORIGIN"
>;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Browsers define a site by the registrable domain (public suffix list), so
 * sibling hosts such as app.example.com and content.example.com share a site.
 * Hosts without a registrable domain (localhost, IP addresses) are compared
 * exactly.
 */
export const isSameSiteHost = (a: string, b: string): boolean => {
  const registrableA = getDomain(a, { allowPrivateDomains: true });
  const registrableB = getDomain(b, { allowPrivateDomains: true });
  if (registrableA && registrableB && registrableA === registrableB) {
    return true;
  }
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
};

const parseOrigin = (value: string | undefined): URL | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    // Plain http is for the local browser test only: loopback names differ
    // as sites ("localhost" vs "127.0.0.1") without needing TLS.
    const schemeAllowed =
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
    return schemeAllowed && url.origin === value ? url : null;
  } catch {
    return null;
  }
};

/**
 * ADR-0012 §1: content must come from a different registrable domain than the
 * app. Only scheme and host (and port) are accepted, and a host that equals
 * the app host or is a subdomain of it (or the reverse) is rejected.
 */
export const isValidArtifactContentOrigin = (
  value: string,
  appHostname: string,
): boolean => {
  const url = parseOrigin(value);
  return !!url && !isSameSiteHost(url.hostname, appHostname.toLowerCase());
};

export type ArtifactContentConfig =
  | { mode: "disabled" }
  /** Content is served from the app host itself (ADR-0010). */
  | { mode: "same-host" }
  /** Content is served from `contentOrigin`; only `appOrigin` may frame it. */
  | { mode: "split"; appOrigin: string; contentOrigin: string };

/**
 * ADR-0012 §2, §5. Unset: self-hosting keeps the same-host sandbox and the
 * official hosted deployment fails closed. Set: both origins must be valid
 * and on different sites, otherwise preview is disabled in every mode.
 * `ARTIFACT_APP_ORIGIN` is needed because the content host, which has no
 * session, must still know which origin may frame it.
 */
export const resolveArtifactContentConfig = (
  env: PreviewPolicyEnv,
): ArtifactContentConfig => {
  const contentValue = env.ARTIFACT_CONTENT_ORIGIN;
  if (contentValue === undefined || contentValue === "") {
    return env.ENTITLEMENT_MODE === "control-plane"
      ? { mode: "disabled" }
      : { mode: "same-host" };
  }
  const content = parseOrigin(contentValue);
  const app = parseOrigin(env.ARTIFACT_APP_ORIGIN);
  if (!content || !app || isSameSiteHost(content.hostname, app.hostname)) {
    return { mode: "disabled" };
  }
  return {
    mode: "split",
    appOrigin: app.origin,
    contentOrigin: content.origin,
  };
};

export const isArtifactPreviewEnabled = (env: PreviewPolicyEnv): boolean =>
  resolveArtifactContentConfig(env).mode !== "disabled";
