/**
 * The app has no inline script, so scripts are limited to the build assets.
 * `'self'` is avoided because it would also cover /artifact-content/, letting
 * an uploaded artifact run as a script inside the authenticated app
 * (ADR-0010 §2).
 */
export function spaIndexHeaders(origin: string): Record<string, string> {
  return {
    "Content-Security-Policy": `script-src ${origin}/assets/; object-src 'none'; base-uri 'self'`,
  };
}
