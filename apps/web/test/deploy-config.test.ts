import { describe, expect, it } from "vitest";
import {
  createDeploymentConfig,
  deploymentCommands,
} from "../scripts/deploy-config";

describe("deployment configuration", () => {
  const base = {
    name: "hosted-app",
    main: "src/index.ts",
    vars: { EXISTING: "value" },
    d1_databases: [{ binding: "DB", database_id: "existing" }],
  };

  it("preserves self-hosted configuration when no service is selected", () => {
    expect(createDeploymentConfig(base)).toEqual(base);
    expect(createDeploymentConfig(base)).not.toHaveProperty("services");
  });

  it("adds only the selected service and mode without mutating base resources", () => {
    const result = createDeploymentConfig(base, "control-plane-production");
    expect(result).toEqual({
      ...base,
      vars: { ...base.vars, ENTITLEMENT_MODE: "control-plane" },
      services: [
        { binding: "CONTROL_PLANE", service: "control-plane-production" },
      ],
    });
    expect(base).not.toHaveProperty("services");
  });

  it("keeps unrelated services and replaces the selected binding without duplicates", () => {
    const result = createDeploymentConfig(
      {
        ...base,
        services: [
          { binding: "OTHER", service: "other" },
          { binding: "CONTROL_PLANE", service: "old" },
        ],
      },
      "new-control-plane",
    );
    expect(result.services).toEqual([
      { binding: "OTHER", service: "other" },
      { binding: "CONTROL_PLANE", service: "new-control-plane" },
    ]);
  });

  it.each([
    "",
    " ",
    "https://example.com",
    "bad\nname",
    "a".repeat(64),
  ])("rejects invalid service %j", (service) => {
    expect(() => createDeploymentConfig(base, service)).toThrow(
      "valid Worker name",
    );
  });

  it.each([
    "deploy",
    "upload",
  ] as const)("never migrates or publishes in %s dry-run", (mode) => {
    expect(deploymentCommands(mode, true, "/tmp/config.json")).toEqual([
      [
        "wrangler",
        "deploy",
        "--config",
        "/tmp/config.json",
        "--dry-run",
        "--keep-vars",
      ],
    ]);
  });

  it("migrates the selected config before deployment, but not before upload", () => {
    expect(deploymentCommands("deploy", false, "config.json")).toEqual([
      [
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "DB",
        "--remote",
        "--config",
        "config.json",
      ],
      ["wrangler", "deploy", "--config", "config.json", "--keep-vars"],
    ]);
    expect(deploymentCommands("upload", false, "config.json")).toEqual([
      ["wrangler", "versions", "upload", "--config", "config.json"],
    ]);
  });
});
