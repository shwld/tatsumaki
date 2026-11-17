import { describe, expect, it, vi } from "vitest";
import { ProjectEntitlementCache } from "../src/application/services/project-entitlement-cache";
import type { ProjectEntitlement } from "../src/domain/entities/entitlement";

const entitlement = (
  overrides: Partial<ProjectEntitlement> = {},
): ProjectEntitlement => ({
  projectId: "p1",
  state: "active",
  validUntil: null,
  revision: 1,
  cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
  ...overrides,
});

const setup = (
  responses: Array<ProjectEntitlement | Error>,
  startMs = 1_000_000,
) => {
  let nowMs = startMs;
  const queue = [...responses];
  const get = vi.fn(async (projectId: string) => {
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (next instanceof Error) throw next;
    return { ...next, projectId };
  });
  const cache = new ProjectEntitlementCache(
    { getProjectEntitlement: get },
    () => nowMs,
  );
  return {
    cache,
    get,
    advance: (seconds: number) => {
      nowMs += seconds * 1000;
    },
  };
};

describe("ProjectEntitlementCache", () => {
  it("allows active and reuses the answer until maxAgeSeconds", async () => {
    const { cache, get, advance } = setup([entitlement()]);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "allow" });
    advance(59);
    await cache.decideWrite("p1");
    expect(get).toHaveBeenCalledTimes(1);
    advance(1);
    await cache.decideWrite("p1");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("denies suspended", async () => {
    const { cache } = setup([entitlement({ state: "suspended" })]);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "suspended" });
  });

  it("denies a grace project once validUntil has passed, even from cache", async () => {
    const validUntil = new Date(1_000_000 + 30_000).toISOString();
    const { cache, get, advance } = setup([
      entitlement({ state: "grace", validUntil }),
    ]);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "allow" });
    advance(29);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "allow" });
    advance(1);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "suspended" });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("keeps projects separate", async () => {
    const { cache, get } = setup([entitlement()]);
    await cache.decideWrite("p1");
    await cache.decideWrite("p2");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("shares one fetch between concurrent callers", async () => {
    const { cache, get } = setup([entitlement()]);
    await Promise.all([cache.decideWrite("p1"), cache.decideWrite("p1")]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("fails closed when there is no cached answer and the fetch fails", async () => {
    const { cache } = setup([new Error("down")]);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "unavailable" });
  });

  it("serves a stale answer for staleIfErrorSeconds after expiry, then fails closed", async () => {
    const { cache, advance } = setup([entitlement(), new Error("down")]);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "allow" });
    advance(60 + 299);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "allow" });
    advance(1);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "unavailable" });
  });

  it("applies a newer answer immediately once the cache expires", async () => {
    const { cache, advance } = setup([
      entitlement(),
      entitlement({ state: "suspended", revision: 2 }),
    ]);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "allow" });
    advance(60);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "suspended" });
  });

  it("does not move back to an older revision", async () => {
    const { cache, advance } = setup([
      entitlement({ state: "suspended", revision: 5 }),
      entitlement({ state: "active", revision: 4 }),
    ]);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "suspended" });
    advance(60);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "suspended" });
  });

  it("refetches after invalidate", async () => {
    const { cache, get } = setup([entitlement()]);
    await cache.decideWrite("p1");
    cache.invalidate("p1");
    await cache.decideWrite("p1");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("rejects an answer for a different project", async () => {
    const cache = new ProjectEntitlementCache({
      getProjectEntitlement: async () => entitlement({ projectId: "other" }),
    });
    expect(await cache.decideWrite("p1")).toEqual({ kind: "unavailable" });
  });
});

describe("ProjectEntitlementCache revision watermark", () => {
  it("does not reopen a suspended project through an older revision after expiry", async () => {
    const { cache, advance } = setup([
      entitlement({ state: "suspended", revision: 5 }),
      entitlement({ state: "active", revision: 4 }),
    ]);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "suspended" });
    advance(60 + 300);
    expect(await cache.decideWrite("p1")).toEqual({ kind: "unavailable" });
    expect(await cache.decideWrite("p1")).toEqual({ kind: "unavailable" });
  });
});
