import { describe, expect, it } from "vitest";
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
} from "../src/presentation/lib/timeline-cursor";

describe("timeline-cursor", () => {
  it("round-trips a valid payload", () => {
    const createdAt = "2026-04-26T12:00:00.000Z";
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const encoded = encodeTimelineCursor(createdAt, id);
    const decoded = decodeTimelineCursor(encoded);
    expect(decoded).toEqual({ ok: true, createdAt, id });
  });

  it("accepts short ids used in tests", () => {
    const createdAt = "2026-04-26T12:00:00.123Z";
    const id = "tl-t1";
    const encoded = encodeTimelineCursor(createdAt, id);
    expect(decodeTimelineCursor(encoded)).toEqual({
      ok: true,
      createdAt,
      id,
    });
  });

  it("rejects non-base64url characters", () => {
    expect(decodeTimelineCursor("ab+c/d")).toEqual({ ok: false });
  });

  it("rejects oversized cursor strings", () => {
    expect(decodeTimelineCursor("a".repeat(600))).toEqual({ ok: false });
  });

  it("rejects cursor with leading or trailing whitespace", () => {
    const encoded = encodeTimelineCursor(
      "2026-04-26T12:00:00.000Z",
      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    );
    expect(decodeTimelineCursor(` ${encoded}`)).toEqual({ ok: false });
    expect(decodeTimelineCursor(`${encoded} `)).toEqual({ ok: false });
  });

  it("rejects JSON with extra keys", () => {
    const badJson = JSON.stringify({
      v: 1,
      c: "2026-04-26T12:00:00.000Z",
      i: "id-1",
      extra: true,
    });
    expect(decodeTimelineCursor(utf8ToBase64UrlForTest(badJson))).toEqual({
      ok: false,
    });
  });

  it("rejects prototype objects", () => {
    expect(decodeTimelineCursor(utf8ToBase64UrlForTest("[1,2,3]"))).toEqual({
      ok: false,
    });
  });

  it("rejects invalid createdAt format", () => {
    const json = JSON.stringify({
      v: 1,
      c: "not-a-date",
      i: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });
    expect(decodeTimelineCursor(utf8ToBase64UrlForTest(json))).toEqual({
      ok: false,
    });
  });
});

function utf8ToBase64UrlForTest(json: string): string {
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
