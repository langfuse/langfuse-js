import { defineWorkspace } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineWorkspace([
  {
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      setupFiles: ["./vitest.setup.ts"],
    },
    resolve: {
      alias: {
        "@langfuse/client": fileURLToPath(
          new URL("./packages/client/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/tracing": fileURLToPath(
          new URL("./packages/tracing/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/otel": fileURLToPath(
          new URL("./packages/otel/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/langchain": fileURLToPath(
          new URL("./packages/langchain/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/openai": fileURLToPath(
          new URL("./packages/openai/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/core": fileURLToPath(
          new URL("./packages/core/dist/index.mjs", import.meta.url),
        ),
      },
    },
  },
  {
    test: {
      name: "e2e",
      environment: "node",
      include: ["tests/e2e/**/*.test.ts"],
      setupFiles: ["./vitest.setup.ts"],
      testTimeout: 30000, // Longer timeout for real HTTP calls
    },
    resolve: {
      alias: {
        "@langfuse/client": fileURLToPath(
          new URL("./packages/client/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/tracing": fileURLToPath(
          new URL("./packages/tracing/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/otel": fileURLToPath(
          new URL("./packages/otel/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/langchain": fileURLToPath(
          new URL("./packages/langchain/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/openai": fileURLToPath(
          new URL("./packages/openai/dist/index.mjs", import.meta.url),
        ),
        "@langfuse/core": fileURLToPath(
          new URL("./packages/core/dist/index.mjs", import.meta.url),
        ),
      },
    },
  },
]);
