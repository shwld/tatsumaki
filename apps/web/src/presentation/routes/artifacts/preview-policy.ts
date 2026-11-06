import type { Bindings } from "../../../index";

type PreviewPolicyEnv = Pick<
  Bindings,
  "ENTITLEMENT_MODE" | "ARTIFACT_CONTENT_ORIGIN"
>;

const isSameSiteHost = (a: string, b: string): boolean =>
  a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/**
 * ADR-0012 §1: content must come from a different registrable domain than the
 * app. Only scheme and host (and port) are accepted, and a host that equals
 * the app host or is a subdomain of it (or the reverse) is rejected.
 */
export const isValidArtifactContentOrigin = (
  value: string,
  appHostname: string,
): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.origin !== value) return false;
  return !isSameSiteHost(url.hostname, appHostname.toLowerCase());
};

/**
 * ADR-0012 §5: preview is fail-closed when the official hosted deployment has
 * no valid `ARTIFACT_CONTENT_ORIGIN`; self-hosting keeps the same-host
 * sandbox when the variable is unset. A set but invalid value disables
 * preview in every mode.
 */
export const isArtifactPreviewEnabled = (
  env: PreviewPolicyEnv,
  requestUrl: string,
): boolean => {
  const origin = env.ARTIFACT_CONTENT_ORIGIN;
  if (origin === undefined || origin === "") {
    return env.ENTITLEMENT_MODE !== "control-plane";
  }
  return isValidArtifactContentOrigin(origin, new URL(requestUrl).hostname);
};
