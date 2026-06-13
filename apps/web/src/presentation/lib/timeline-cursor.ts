export type TimelineCursorV1 = {
  v: 1;
  c: string;
  i: string;
};

/** Max length of the base64url cursor string (prevents huge payloads). */
const MAX_CURSOR_STRING_LENGTH = 512;

/** `createdAt` as stored in DB / ISO-8601 UTC from `Date.prototype.toISOString()`. */
const CURSOR_CREATED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Timeline entry id: alphanumeric, hyphen, underscore; typical ULID or test ids. */
const CURSOR_ID_RE = /^[\w-]{1,128}$/;

function utf8ToBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToUtf8(cursor: string): string {
  const padded = cursor.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function validateCursorPayload(parsed: unknown): TimelineCursorV1 | null {
  if (!isPlainObject(parsed)) {
    return null;
  }
  const keys = Object.keys(parsed);
  if (keys.length !== 3) {
    return null;
  }
  for (const k of keys) {
    if (k !== "v" && k !== "c" && k !== "i") {
      return null;
    }
  }
  if (parsed.v !== 1) {
    return null;
  }
  if (typeof parsed.c !== "string" || typeof parsed.i !== "string") {
    return null;
  }
  const c = parsed.c;
  const i = parsed.i;
  if (
    c.length === 0 ||
    i.length === 0 ||
    !CURSOR_CREATED_AT_RE.test(c) ||
    !CURSOR_ID_RE.test(i)
  ) {
    return null;
  }
  return { v: 1, c, i };
}

export function encodeTimelineCursor(createdAt: string, id: string): string {
  const payload: TimelineCursorV1 = { v: 1, c: createdAt, i: id };
  const json = JSON.stringify(payload);
  return utf8ToBase64Url(json);
}

export function decodeTimelineCursor(
  cursor: string,
): { ok: true; createdAt: string; id: string } | { ok: false } {
  try {
    const trimmed = cursor.trim();
    if (
      trimmed.length === 0 ||
      trimmed.length > MAX_CURSOR_STRING_LENGTH ||
      trimmed !== cursor
    ) {
      return { ok: false };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      return { ok: false };
    }
    const json = base64UrlToUtf8(trimmed);
    const parsed: unknown = JSON.parse(json);
    const payload = validateCursorPayload(parsed);
    if (!payload) {
      return { ok: false };
    }
    return { ok: true, createdAt: payload.c, id: payload.i };
  } catch {
    return { ok: false };
  }
}
