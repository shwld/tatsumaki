import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const isComponentTarget = args.some((arg) => arg.startsWith("src/client/"));

const vitestArgs = ["run"];
if (isComponentTarget) {
  vitestArgs.push("-c", "vitest.component.config.ts");
}
vitestArgs.push(...args);

const result = spawnSync("vitest", vitestArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
