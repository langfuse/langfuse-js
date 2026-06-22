import { defineWorkspace } from "vitest/config";

// Workspace projects do not inherit the root vitest.config.ts, so each declares
// how to resolve the @langfuse/* packages: unit tests run against source (no
// build needed), integration/e2e run against the built dist.
const aliasTo = (
  entry: "src/index.ts" | "dist/index.mjs",
): Record<string, string> =>
  Object.fromEntries(
    ["client", "core", "tracing", "otel", "langchain", "openai"].map((pkg) => [
      `@langfuse/${pkg}`,
      new URL(`./packages/${pkg}/${entry}`, import.meta.url).pathname,
    ]),
  );

export default defineWorkspace([
  {
    test: {
      name: "unit",
      environment: "node",
      include: ["tests/unit/**/*.test.ts"],
    },
    resolve: { alias: aliasTo("src/index.ts") },
  },
  {
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      setupFiles: ["./vitest.setup.ts"],
    },
    resolve: { alias: aliasTo("dist/index.mjs") },
  },
  {
    test: {
      name: "e2e",
      environment: "node",
      include: ["tests/e2e/**/*.test.ts"],
      setupFiles: ["./vitest.setup.ts"],
      testTimeout: 30000, // Longer timeout for real HTTP calls
    },
    resolve: { alias: aliasTo("dist/index.mjs") },
  },
]);
