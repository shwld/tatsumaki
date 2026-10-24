/**
 * The app has no inline script, so scripts are limited to the build assets.
 * `'self'` is avoided because it would also cover /artifact-content/, letting
 * an uploaded artifact run as a script inside the authenticated app
 * (ADR-0010 §2).
 *
 * The only frames the app embeds are artifact previews, so frames (and any
 * later navigation of them, e.g. an artifact sending its own iframe elsewhere)
 * are limited to /artifact-content/ too.
 */
export function spaIndexHeaders(origin: string): Record<string, string> {
  return {
    "Content-Security-Policy": `script-src ${origin}/assets/; frame-src ${origin}/artifact-content/; object-src 'none'; base-uri 'self'`,
  };
}
