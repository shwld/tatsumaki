import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ARTIFACTS bucket access", () => {
  function listSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return listSourceFiles(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  it("is referenced only by the Env binding type and the artifact routes that build the object store", () => {
    const srcRoot = path.resolve(__dirname, "../src");
    const referencing = listSourceFiles(srcRoot)
      .filter((file) => /\bARTIFACTS\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(srcRoot, file));
    expect(referencing.sort()).toEqual([
      "index.ts",
      "presentation/routes/artifacts/routes.ts",
    ]);
  });

  it("keeps R2Bucket out of the application and domain layers", () => {
    const srcRoot = path.resolve(__dirname, "../src");
    const offenders = [
      ...listSourceFiles(path.join(srcRoot, "domain")),
      ...listSourceFiles(path.join(srcRoot, "application")),
    ].filter((file) => /R2Bucket/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
