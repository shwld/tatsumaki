/// <reference types="node" />
import { writeFileSync } from "node:fs";
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
const doc = normalizeCliOpenApiDoc(
  buildCliOpenApiDoc() as unknown as Record<string, unknown>,
);

writeFileSync(outputPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`Generated: ${outputPath}`);
