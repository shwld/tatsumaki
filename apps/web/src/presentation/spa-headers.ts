/**
 * The app has no inline script, so scripts are limited to the build assets.
 * `'self'` is avoided because it would also cover /artifact-content/, letting
 * an uploaded artifact run as a script inside the authenticated app
 * (ADR-0010 §2).
 *
 * The only frames the app embeds are artifact previews, so frames (and any
 * later navigation of them, e.g. an artifact sending its own iframe elsewhere)
 * are limited to /artifact-content/ too.
 *
 * Turnstile (onboarding) is the only third-party script and frame:
 * https://developers.cloudflare.com/turnstile/reference/content-security-policy/
 */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * `contentOrigin` is where artifact previews are served from: the app origin
 * itself unless a separate site is configured (ADR-0012 §3).
 */
export function spaIndexHeaders(
  origin: string,
  contentOrigin: string = origin,
): Record<string, string> {
  return {
    "Content-Security-Policy": `script-src ${origin}/assets/ ${TURNSTILE_ORIGIN}; frame-src ${contentOrigin}/artifact-content/ ${TURNSTILE_ORIGIN}; object-src 'none'; base-uri 'self'`,
  };
}
