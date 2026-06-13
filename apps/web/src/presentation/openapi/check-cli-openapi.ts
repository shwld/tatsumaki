/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCliOpenApiDoc } from "./cli-openapi";
import { normalizeCliOpenApiDoc } from "./normalize-cli-openapi";

const outputPath = resolve(
  process.cwd(),
  "..",
  "..",
  "packages",
  "contracts",
  "cli-openapi.json",
);
const expected = normalizeCliOpenApiDoc(
  buildCliOpenApiDoc() as unknown as Record<string, unknown>,
);
const actualRaw = readFileSync(outputPath, "utf8");
const actual = JSON.parse(actualRaw) as Record<string, unknown>;

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(
    "OpenAPI drift detected. Run: bun run --cwd apps/web openapi:generate",
  );
  process.exit(1);
}

console.log("OpenAPI check passed");
