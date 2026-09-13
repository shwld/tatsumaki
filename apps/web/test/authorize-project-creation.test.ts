import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import type { EntitlementProvider } from "../src/application/ports/entitlement-provider";
import {
  authorizeProjectCreation,
  ENTITLEMENT_UNAVAILABLE_ERROR,
  PROJECT_CREATION_DISABLED_ERROR,
} from "../src/application/usecases/authorize-project-creation";

const entitlementProvider = (
  maxOwnedProjects: number | null,
): EntitlementProvider => ({
  getEntitlement: async (billingAccountId) => ({
    billingAccountId,
    plan: "free",
    state: "active",
    limits: { maxOwnedProjects },
    validUntil: null,
    revision: 1,
    cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
  }),
});

describe("authorizeProjectCreation", () => {
  it("rejects creation for a Free account with a zero-project limit", async () => {
    const countOwnedProjects = vi.fn(async () => ok(0));

    const result = await authorizeProjectCreation(
      entitlementProvider(0),
      { countOwnedProjects },
      "user_1",
    );

    expect(result).toEqual(err(PROJECT_CREATION_DISABLED_ERROR));
    expect(countOwnedProjects).not.toHaveBeenCalled();
  });

  it("allows creation below a finite project limit", async () => {
    const result = await authorizeProjectCreation(
      entitlementProvider(1),
      { countOwnedProjects: async () => ok(0) },
      "user_1",
    );

    expect(result).toEqual(ok(undefined));
  });

  it("rejects creation after reaching a finite project limit", async () => {
    const result = await authorizeProjectCreation(
      entitlementProvider(1),
      { countOwnedProjects: async () => ok(1) },
      "user_1",
    );

    expect(result).toEqual(err(PROJECT_CREATION_DISABLED_ERROR));
  });

  it("allows unlimited and does not need an owned-project count", async () => {
    const countOwnedProjects = vi.fn(async () => ok(0));

    const result = await authorizeProjectCreation(
      entitlementProvider(null),
      { countOwnedProjects },
      "user_1",
    );

    expect(result).toEqual(ok(undefined));
    expect(countOwnedProjects).not.toHaveBeenCalled();
  });

  it("fails closed when entitlement cannot be loaded", async () => {
    const result = await authorizeProjectCreation(
      {
        getEntitlement: async () => {
          throw new Error("unavailable");
        },
      },
      { countOwnedProjects: async () => ok(0) },
      "user_1",
    );

    expect(result).toEqual(err(ENTITLEMENT_UNAVAILABLE_ERROR));
  });
});
