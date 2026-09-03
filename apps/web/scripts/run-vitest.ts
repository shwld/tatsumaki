import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const isComponentTarget = args.some((arg) => arg.startsWith("src/client/"));
const isCloudflareSetupTarget = args.some(
  (arg) =>
    arg === "test/cloudflare-setup.test.ts" ||
    arg === "test/deploy-config.test.ts",
);

function runVitest(extraArgs: string[], config?: string): number {
  const vitestArgs = ["run"];
  if (config) vitestArgs.push("-c", config);
  vitestArgs.push(...extraArgs);

  const result = spawnSync("vitest", vitestArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

if (args.length === 0) {
  const workerStatus = runVitest([]);
  if (workerStatus !== 0) process.exit(workerStatus);
  process.exit(runVitest([], "vitest.cloudflare-setup.config.ts"));
}

process.exit(
  runVitest(
    args,
    isComponentTarget
      ? "vitest.component.config.ts"
      : isCloudflareSetupTarget
        ? "vitest.cloudflare-setup.config.ts"
        : undefined,
  ),
);
