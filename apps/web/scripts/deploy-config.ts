import { z } from "zod";

const configSchema = z
  .object({
    vars: z.record(z.string(), z.unknown()).optional(),
    d1_databases: z
      .array(
        z
          .object({
            binding: z.string(),
            database_id: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    kv_namespaces: z
      .array(
        z
          .object({ binding: z.string(), id: z.string().optional() })
          .passthrough(),
      )
      .optional(),
    services: z
      .array(z.object({ binding: z.string() }).passthrough())
      .optional(),
  })
  .passthrough();

type DeploymentOverrides = {
  controlPlaneService?: string;
  d1DatabaseId?: string;
  oauthKvNamespaceId?: string;
};

const d1IdSchema = z.string().uuid();
const kvIdSchema = z.string().regex(/^[a-f0-9]{32}$/);

export function createDeploymentConfig(
  input: unknown,
  overrides: DeploymentOverrides = {},
) {
  const config = configSchema.parse(input);
  const service = overrides.controlPlaneService;
  if (
    service === undefined &&
    overrides.d1DatabaseId === undefined &&
    overrides.oauthKvNamespaceId === undefined
  )
    return config;
  if (service === undefined)
    throw new Error(
      "CONTROL_PLANE_SERVICE is required with hosted resource IDs.",
    );
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(service)) {
    throw new Error("CONTROL_PLANE_SERVICE must be a valid Worker name.");
  }
  const d1DatabaseId = overrides.d1DatabaseId
    ? d1IdSchema.parse(overrides.d1DatabaseId)
    : undefined;
  const oauthKvNamespaceId = overrides.oauthKvNamespaceId
    ? kvIdSchema.parse(overrides.oauthKvNamespaceId)
    : undefined;
  const d1Databases = config.d1_databases?.map((binding) =>
    binding.binding === "DB" && d1DatabaseId
      ? { ...binding, database_id: d1DatabaseId }
      : binding,
  );
  const kvNamespaces = config.kv_namespaces?.map((binding) =>
    binding.binding === "OAUTH_KV" && oauthKvNamespaceId
      ? { ...binding, id: oauthKvNamespaceId }
      : binding,
  );
  if (!d1Databases?.some((binding) => binding.binding === "DB"))
    throw new Error("Deployment config must contain the DB binding.");
  if (!d1Databases.some((binding) => binding.database_id))
    throw new Error(
      "CLOUDFLARE_D1_DATABASE_ID is required when DB has no database_id.",
    );
  if (!kvNamespaces?.some((binding) => binding.binding === "OAUTH_KV"))
    throw new Error("Deployment config must contain the OAUTH_KV binding.");
  if (!kvNamespaces.some((binding) => binding.id))
    throw new Error(
      "CLOUDFLARE_OAUTH_KV_NAMESPACE_ID is required when OAUTH_KV has no id.",
    );
  return {
    ...config,
    d1_databases: d1Databases,
    kv_namespaces: kvNamespaces,
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
