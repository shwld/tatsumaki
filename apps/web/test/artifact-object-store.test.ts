import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { ArtifactObjectStore } from "../src/application/ports/artifact-object-store";
import { InMemoryArtifactObjectStore } from "../src/infrastructure/storage/in-memory-artifact-object-store";
import { R2ArtifactObjectStore } from "../src/infrastructure/storage/r2-artifact-object-store";

async function readText(body: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(body).text();
}

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

const factories: Array<[string, () => ArtifactObjectStore]> = [
  ["in-memory", () => new InMemoryArtifactObjectStore()],
  ["r2", () => new R2ArtifactObjectStore(env.ARTIFACTS as R2Bucket)],
];

describe.each(factories)("ArtifactObjectStore (%s)", (_name, create) => {
  let store: ArtifactObjectStore;
  const prefix = `contract-${crypto.randomUUID()}/`;

  beforeEach(() => {
    store = create();
  });

  it("round-trips an ArrayBuffer body with its size", async () => {
    await store.put(`${prefix}a`, bytesOf("hello"), {
      contentType: "text/plain",
    });
    const stored = await store.get(`${prefix}a`);
    expect(stored?.size).toBe(5);
    expect(await readText(stored!.body)).toBe("hello");
  });

  it("returns null for a missing key and deletes idempotently", async () => {
    expect(await store.get(`${prefix}missing`)).toBeNull();
    await store.delete(`${prefix}missing`);
    await store.put(`${prefix}b`, bytesOf("x"), { contentType: "text/plain" });
    await store.delete(`${prefix}b`);
    expect(await store.get(`${prefix}b`)).toBeNull();
  });

  it("lists by prefix and paginates with a cursor", async () => {
    for (const name of ["k1", "k2", "k3"]) {
      await store.put(`${prefix}list/${name}`, bytesOf(name), {
        contentType: "text/plain",
      });
    }
    await store.put(`${prefix}other/k9`, bytesOf("z"), {
      contentType: "text/plain",
    });

    const first = await store.list({ prefix: `${prefix}list/`, limit: 2 });
    expect(first.keys).toHaveLength(2);
    expect(first.cursor).not.toBeNull();

    const second = await store.list({
      prefix: `${prefix}list/`,
      limit: 2,
      cursor: first.cursor!,
    });
    expect(second.keys).toHaveLength(1);
    expect(second.cursor).toBeNull();
    expect([...first.keys, ...second.keys].sort()).toEqual([
      `${prefix}list/k1`,
      `${prefix}list/k2`,
      `${prefix}list/k3`,
    ]);
  });

  it("deletes many keys at once and ignores missing ones", async () => {
    for (const name of ["m1", "m2", "m3"]) {
      await store.put(`${prefix}many/${name}`, bytesOf(name), {
        contentType: "text/plain",
      });
    }

    await store.deleteMany([
      `${prefix}many/m1`,
      `${prefix}many/m2`,
      `${prefix}many/never-existed`,
    ]);

    expect((await store.list({ prefix: `${prefix}many/` })).keys).toEqual([
      `${prefix}many/m3`,
    ]);
    await store.deleteMany([]);
  });

  it("lists first-level prefixes with pagination", async () => {
    for (const project of ["p1", "p2", "p3"]) {
      await store.put(`${prefix}tree/${project}/blobs/x`, bytesOf("x"), {
        contentType: "text/plain",
      });
    }
    await store.put(`${prefix}tree/loose`, bytesOf("x"), {
      contentType: "text/plain",
    });

    // `limit` counts objects and prefixes together, so a page can hold fewer
    // prefixes than the limit; follow the cursor to the end.
    const collected: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await store.listPrefixes({
        prefix: `${prefix}tree/`,
        limit: 2,
        cursor,
      });
      collected.push(...page.prefixes);
      cursor = page.cursor ?? undefined;
      pages += 1;
    } while (cursor !== undefined && pages < 10);

    expect(collected.sort()).toEqual([
      `${prefix}tree/p1/`,
      `${prefix}tree/p2/`,
      `${prefix}tree/p3/`,
    ]);
    expect(pages).toBeGreaterThan(1);
  });
});
