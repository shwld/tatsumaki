import { describe, expect, it } from "vitest";
import { requireProjectAccess } from "../src/presentation/routes/mcp/project-access";
import { createProjectRepositoryMock } from "./helpers/project-repository";

const entitlement = (state: string) => ({
  projectId: "p1",
  state,
  validUntil: null,
  revision: 1,
  cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
});

const guard = (getProjectEntitlement: () => Promise<unknown>) => ({
  ENTITLEMENT_MODE: "control-plane",
  PROJECT_WRITE_ENFORCEMENT: "true",
  CONTROL_PLANE: { getProjectEntitlement } as never,
});

const repository = createProjectRepositoryMock();

describe("requireProjectAccess write guard", () => {
  it("only checks membership for reads", async () => {
    const result = await requireProjectAccess(repository, "p1", "u1");
    expect(result.ok).toBe(true);
  });

  it("refuses a write tool on a suspended project", async () => {
    const result = await requireProjectAccess(
      repository,
      "p1",
      "u1",
      guard(async () => entitlement("suspended")),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.isError).toBe(true);
      expect(result.response.content[0].text).toContain("PROJECT_SUSPENDED");
    }
  });

  it("refuses a write tool when the billing state is unknown", async () => {
    const result = await requireProjectAccess(
      repository,
      "p1",
      "u1",
      guard(async () => {
        throw new Error("down");
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.content[0].text).toContain(
        "ENTITLEMENT_UNAVAILABLE",
      );
    }
  });

  it("allows a write tool on an active project", async () => {
    const result = await requireProjectAccess(
      repository,
      "p1",
      "u1",
      guard(async () => entitlement("active")),
    );
    expect(result.ok).toBe(true);
  });
});
