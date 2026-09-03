import { TOML } from "bun";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeploymentConfig, deploymentCommands } from "./deploy-config";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [mode, ...args] = process.argv.slice(2);
let configPath = join(webDir, "wrangler.toml");
let dryRun = false;

try {
  if (mode !== "deploy" && mode !== "upload")
    throw new Error("Expected deploy or upload.");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    else if (
      args[i] === "--config" &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    ) {
      configPath = resolve(args[++i]);
    } else throw new Error(`Unsupported option: ${args[i]}`);
  }
  const source = await readFile(configPath, "utf8");
  const base = configPath.endsWith(".json")
    ? JSON.parse(source)
    : TOML.parse(source);
  const config = createDeploymentConfig(
    base,
    process.env.CONTROL_PLANE_SERVICE,
  );
  const generatedPath = join(
    dirname(configPath),
    `.wrangler-deploy-${randomUUID()}.json`,
  );
  await writeFile(generatedPath, JSON.stringify(config, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  try {
    console.log(
      `Worker: ${config.name}; Control Plane: ${process.env.CONTROL_PLANE_SERVICE ?? "configured in base config or disabled"}`,
    );
    for (const [command, ...commandArgs] of deploymentCommands(
      mode,
      dryRun,
      generatedPath,
    )) {
      const executable = join(
        webDir,
        "node_modules",
        ".bin",
        process.platform === "win32" ? `${command}.cmd` : command,
      );
      const result = spawnSync(executable, commandArgs, {
        cwd: webDir,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `${command} ${commandArgs[0]} failed (${result.status ?? result.signal}).`,
        );
    }
  } finally {
    await unlink(generatedPath);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
