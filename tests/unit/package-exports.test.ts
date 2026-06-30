import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const packageNames = [
  "browser",
  "client",
  "core",
  "langchain",
  "openai",
  "otel",
  "tracing",
  "vercel-ai-sdk",
] as const;

type PackageJson = {
  exports: {
    ".": Record<string, unknown>;
  };
};

function readPackageJson(packageName: string): PackageJson {
  const packageJsonPath = join(
    repoRoot,
    "packages",
    packageName,
    "package.json",
  );
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
}

describe("package exports", () => {
  it("routes NodeNext CommonJS consumers to CJS declaration files", () => {
    for (const packageName of packageNames) {
      const rootExport = readPackageJson(packageName).exports["."];

      expect(rootExport, packageName).toEqual({
        import: {
          types: "./dist/index.d.ts",
          default: "./dist/index.mjs",
        },
        require: {
          types: "./dist/index.d.cts",
          default: "./dist/index.cjs",
        },
      });
      expect(Object.keys(rootExport.import as object), packageName).toEqual([
        "types",
        "default",
      ]);
      expect(Object.keys(rootExport.require as object), packageName).toEqual([
        "types",
        "default",
      ]);
      expect(rootExport, packageName).not.toHaveProperty("types");
    }
  });
});
