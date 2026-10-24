const DISABLED_FEATURES = [
  "accelerometer",
  "ambient-light-sensor",
  "autoplay",
  "bluetooth",
  "camera",
  "clipboard-read",
  "clipboard-write",
  "display-capture",
  "encrypted-media",
  "fullscreen",
  "geolocation",
  "gyroscope",
  "hid",
  "idle-detection",
  "local-fonts",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "picture-in-picture",
  "publickey-credentials-get",
  "screen-wake-lock",
  "serial",
  "speaker-selection",
  "usb",
  "web-share",
  "xr-spatial-tracking",
];

/**
 * `contentBase` is `https://<origin>/artifact-content/<token>/`. Sources are
 * pinned to that path rather than `'self'`, so the artifact cannot reach the
 * rest of the tatsumaki origin (ADR-0010 §2, §4).
 */
export function artifactContentSecurityPolicy(
  origin: string,
  contentBase: string,
): string {
  return [
    "sandbox allow-scripts",
    "default-src 'none'",
    `script-src ${contentBase} 'unsafe-inline'`,
    `style-src ${contentBase} 'unsafe-inline'`,
    `img-src ${contentBase} data:`,
    `font-src ${contentBase}`,
    `media-src ${contentBase}`,
    "connect-src 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "worker-src 'none'",
    `frame-ancestors ${origin}`,
  ].join("; ");
}

export function artifactContentHeaders(
  origin: string,
  contentBase: string,
): Record<string, string> {
  return {
    "Content-Security-Policy": artifactContentSecurityPolicy(
      origin,
      contentBase,
    ),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": DISABLED_FEATURES.map(
      (feature) => `${feature}=()`,
    ).join(", "),
    "Cache-Control": "private, no-store",
    "Access-Control-Allow-Origin": "*",
  };
}

/** Restrictive headers for requests that never got as far as a valid token. */
export function artifactContentDeniedHeaders(
  origin: string,
): Record<string, string> {
  return artifactContentHeaders(origin, `${origin}/artifact-content/`);
}

/**
 * A document load is always allowed (the CSP sandbox is enforced on it). Any
 * other destination is a subresource, which is legitimate only from the
 * sandboxed artifact document: an opaque origin is reported as cross-site,
 * whereas the tatsumaki app embedding the URL as a script is not.
 */
export function isAllowedArtifactContentFetch(headers: Headers): boolean {
  const dest = headers.get("Sec-Fetch-Dest");
  if (dest === "iframe" || dest === "document") return true;
  if (dest === null) return false;
  return headers.get("Sec-Fetch-Site") === "cross-site";
}
