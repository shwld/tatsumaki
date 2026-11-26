import { describe, expect, it } from "vitest";
import { requireProjectAccess } from "../src/presentation/routes/mcp/project-access";
import { createProjectRepositoryMock } from "./helpers/project-repository";
import { projectUsage } from "./helpers/project-usage";

const guard = (getProjectUsage: () => Promise<unknown>) => ({
  ENTITLEMENT_MODE: "control-plane",
  PROJECT_WRITE_ENFORCEMENT: "true",
  CONTROL_PLANE: { getProjectUsage } as never,
});

const repository = createProjectRepositoryMock();

describe("requireProjectAccess write guard", () => {
  it("only checks membership for reads", async () => {
    const result = await requireProjectAccess(repository, "p1", "u1");
    expect(result.ok).toBe(true);
  });

  it("refuses a write tool on a view-only project", async () => {
    const result = await requireProjectAccess(
      repository,
      "p1",
      "u1",
      guard(async () => projectUsage("read_only")),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.isError).toBe(true);
      expect(result.response.content[0].text).toContain("PROJECT_SUSPENDED");
    }
  });

  it("refuses a write tool when the usage state is unknown", async () => {
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

  it("allows a write tool on an available project", async () => {
    const result = await requireProjectAccess(
      repository,
      "p1",
      "u1",
      guard(async () => projectUsage()),
    );
    expect(result.ok).toBe(true);
  });
});
