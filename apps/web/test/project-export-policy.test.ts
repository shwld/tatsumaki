import { describe, expect, it } from "vitest";
import { decideProjectExport } from "../src/infrastructure/entitlements/project-write-guard";

const projectId = "p1";
const entitlement = (state: string, validUntil: string | null = null) => ({
  projectId,
  state,
  validUntil,
  revision: 1,
  cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
});

const bindings = (getProjectEntitlement: () => Promise<unknown>) => ({
  ENTITLEMENT_MODE: "control-plane",
  PROJECT_WRITE_ENFORCEMENT: "true",
  CONTROL_PLANE: { getProjectEntitlement } as never,
});

const roles = ["owner", "member", "viewer"] as const;

describe("decideProjectExport", () => {
  for (const state of ["active", "grace"]) {
    for (const role of roles) {
      it(`${role} x ${state}`, async () => {
        const denial = await decideProjectExport(
          bindings(async () =>
            entitlement(
              state,
              state === "grace" ? "2999-01-01T00:00:00Z" : null,
            ),
          ),
          projectId,
          role,
        );
        if (role === "owner") expect(denial).toBeNull();
        else expect(denial?.body.code).toBe("EXPORT_OWNER_ONLY");
      });
    }
  }

  for (const role of roles) {
    it(`${role} x suspended is denied`, async () => {
      const denial = await decideProjectExport(
        bindings(async () => entitlement("suspended")),
        projectId,
        role,
      );
      expect(denial?.status).toBe(403);
      expect(denial?.body.code).toBe(
        role === "owner" ? "PROJECT_SUSPENDED" : "EXPORT_OWNER_ONLY",
      );
    });
  }

  it("owner with expired grace is denied", async () => {
    const denial = await decideProjectExport(
      bindings(async () => entitlement("grace", "2000-01-01T00:00:00Z")),
      projectId,
      "owner",
    );
    expect(denial?.body.code).toBe("PROJECT_SUSPENDED");
  });

  it("owner gets 503 when the control plane is down", async () => {
    const denial = await decideProjectExport(
      bindings(async () => {
        throw new Error("down");
      }),
      "p-down",
      "owner",
    );
    expect(denial?.status).toBe(503);
    expect(denial?.body.code).toBe("ENTITLEMENT_UNAVAILABLE");
  });

  it("non-owner is denied without reaching the control plane", async () => {
    let called = false;
    const denial = await decideProjectExport(
      bindings(async () => {
        called = true;
        return entitlement("active");
      }),
      projectId,
      "viewer",
    );
    expect(denial?.status).toBe(403);
    expect(called).toBe(false);
  });

  it("self-hosted owner is allowed, non-owner still denied", async () => {
    expect(await decideProjectExport({}, projectId, "owner")).toBeNull();
    expect((await decideProjectExport({}, projectId, "member"))?.status).toBe(
      403,
    );
  });
});
