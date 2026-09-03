import { z } from "zod";

const configSchema = z
  .object({
    vars: z.record(z.string(), z.unknown()).optional(),
    services: z
      .array(z.object({ binding: z.string() }).passthrough())
      .optional(),
  })
  .passthrough();

export function createDeploymentConfig(input: unknown, service?: string) {
  const config = configSchema.parse(input);
  if (service === undefined) return config;
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(service)) {
    throw new Error("CONTROL_PLANE_SERVICE must be a valid Worker name.");
  }
  return {
    ...config,
    vars: { ...config.vars, ENTITLEMENT_MODE: "control-plane" },
    services: [
      ...(config.services ?? []).filter(
        (binding) => binding.binding !== "CONTROL_PLANE",
      ),
      { binding: "CONTROL_PLANE", service },
    ],
  };
}

export function deploymentCommands(
  mode: "deploy" | "upload",
  dryRun: boolean,
  configPath: string,
): string[][] {
  const configArgs = ["--config", configPath];
  if (dryRun)
    return [["wrangler", "deploy", ...configArgs, "--dry-run", "--keep-vars"]];
  if (mode === "upload")
    return [["wrangler", "versions", "upload", ...configArgs]];
  return [
    ["wrangler", "d1", "migrations", "apply", "DB", "--remote", ...configArgs],
    ["wrangler", "deploy", ...configArgs, "--keep-vars"],
  ];
}
