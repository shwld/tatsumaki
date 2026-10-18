const TEXT = "; charset=utf-8";

// Allowlist keyed by lower-case extension. PDF, XML/XHTML and XSLT are
// deliberately absent (ADR-0010 threat model).
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  html: `text/html${TEXT}`,
  css: `text/css${TEXT}`,
  js: `text/javascript${TEXT}`,
  mjs: `text/javascript${TEXT}`,
  json: `application/json${TEXT}`,
  txt: `text/plain${TEXT}`,
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Returns the server-decided Content-Type, or null when not allowed. */
export function artifactContentTypeForPath(path: string): string | null {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return null;
  const extension = fileName.slice(dot + 1).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? null;
}
