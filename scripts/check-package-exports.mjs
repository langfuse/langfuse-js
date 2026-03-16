import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packages = ["client", "core", "langchain", "openai", "otel", "tracing"];
const expectedExports = {
  import: {
    types: "./dist/index.d.ts",
    default: "./dist/index.mjs",
  },
  require: {
    types: "./dist/index.d.cts",
    default: "./dist/index.cjs",
  },
};

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const packageDir of packages) {
  const packageJsonPath = resolve(
    rootDir,
    "packages",
    packageDir,
    "package.json",
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  assert.deepStrictEqual(
    packageJson.exports?.["."],
    expectedExports,
    `${packageJson.name} must expose conditional import/require type declarations`,
  );
}

console.log(`Verified package exports for ${packages.length} packages.`);
