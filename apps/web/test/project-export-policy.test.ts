import { describe, expect, it } from "vitest";
import { decideProjectExport } from "../src/infrastructure/entitlements/project-write-guard";
import { projectUsage } from "./helpers/project-usage";

const projectId = "p1";
const bindings = (getProjectUsage: () => Promise<unknown>) => ({
  ENTITLEMENT_MODE: "control-plane",
  PROJECT_WRITE_ENFORCEMENT: "true",
  CONTROL_PLANE: { getProjectUsage } as never,
});

const roles = ["owner", "member", "viewer"] as const;

describe("decideProjectExport", () => {
  for (const kind of ["available", "ending", "action_required"] as const) {
    for (const role of roles) {
      it(`${role} x ${kind}`, async () => {
        const denial = await decideProjectExport(
          bindings(async () => projectUsage(kind)),
          projectId,
          role,
        );
        if (role === "owner") expect(denial).toBeNull();
        else expect(denial?.body.code).toBe("EXPORT_OWNER_ONLY");
      });
    }
  }

  for (const role of roles) {
    it(`${role} x view only is denied`, async () => {
      const denial = await decideProjectExport(
        bindings(async () => projectUsage("read_only")),
        projectId,
        role,
      );
      expect(denial?.status).toBe(403);
      expect(denial?.body.code).toBe(
        role === "owner" ? "PROJECT_SUSPENDED" : "EXPORT_OWNER_ONLY",
      );
    });
  }

  it("owner past the deadline is denied", async () => {
    const denial = await decideProjectExport(
      bindings(async () =>
        projectUsage("action_required", { until: "2000-01-01T00:00:00Z" }),
      ),
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
        return projectUsage();
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

describe("getProjectAccessState", () => {
  it("reports available, limited, view only, and a passed deadline as view only", async () => {
    const { getProjectAccessState } = await import(
      "../src/infrastructure/entitlements/project-write-guard"
    );
    const state = (usage: unknown) =>
      getProjectAccessState(
        bindings(async () => usage),
        projectId,
      );
    expect(await state(projectUsage())).toEqual({ kind: "available" });
    expect(await state(projectUsage("ending"))).toEqual({
      kind: "limited",
      until: "2999-01-01T00:00:00Z",
      untilReason: "ending",
    });
    expect(await state(projectUsage("read_only"))).toEqual({
      kind: "read_only",
    });
    expect(
      await state(projectUsage("ending", { until: "2000-01-01T00:00:00Z" })),
    ).toEqual({ kind: "read_only" });
  });

  it("is unknown when the provider fails, and available when not enforcing", async () => {
    const { getProjectAccessState } = await import(
      "../src/infrastructure/entitlements/project-write-guard"
    );
    expect(
      await getProjectAccessState(
        bindings(async () => {
          throw new Error("down");
        }),
        "p-fail",
      ),
    ).toEqual({ kind: "unknown" });
    expect(await getProjectAccessState({}, projectId)).toEqual({
      kind: "available",
    });
  });
});
