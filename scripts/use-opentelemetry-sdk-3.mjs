#!/usr/bin/env node

// Points the workspace's OpenTelemetry dev dependencies at the JS SDK 3.x
// release line, so CI can run the same tests against SDK 2.x and 3.x.
//
// Only the root devDependencies change. pnpm overrides are not used, because
// they would also force third-party packages that depend on SDK 2.x (e.g.
// langsmith) onto 3.x packages they cannot run with.
//
// Usage:
//   node scripts/use-opentelemetry-sdk-3.mjs
//   pnpm install --no-frozen-lockfile

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SDK_3_VERSIONS = {
  "@opentelemetry/api": "^1.10.0",
  "@opentelemetry/core": "^3.0.0",
  "@opentelemetry/exporter-trace-otlp-http": "^0.300.0",
  "@opentelemetry/otlp-exporter-base": "^0.300.0",
  "@opentelemetry/otlp-transformer": "^0.300.0",
  "@opentelemetry/resources": "^3.0.0",
  "@opentelemetry/sdk-node": "^0.300.0",
  "@opentelemetry/sdk-trace": "^3.0.0",
};

const packageJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

for (const [name, version] of Object.entries(SDK_3_VERSIONS)) {
  packageJson.devDependencies[name] = version;
}

writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

console.log("OpenTelemetry dev dependencies set to the JS SDK 3.x line:");
for (const [name, version] of Object.entries(SDK_3_VERSIONS)) {
  console.log(`  ${name}@${version}`);
}
