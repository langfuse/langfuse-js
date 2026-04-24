import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "vercel-ai-sdk",
      environment: "node",
      include: [
        new URL("./packages/vercel-ai-sdk/src/**/*.test.ts", import.meta.url)
          .pathname,
      ],
      setupFiles: [new URL("./vitest.setup.ts", import.meta.url).pathname],
    },
  },
  {
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      setupFiles: ["./vitest.setup.ts"],
    },
    resolve: {
      alias: {
        "@langfuse/client": new URL(
          "./packages/client/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/tracing": new URL(
          "./packages/tracing/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/otel": new URL(
          "./packages/otel/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/langchain": new URL(
          "./packages/langchain/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/openai": new URL(
          "./packages/openai/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/vercel-ai-sdk": new URL(
          "./packages/vercel-ai-sdk/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/core": new URL(
          "./packages/core/dist/index.mjs",
          import.meta.url,
        ).pathname,
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
        "@langfuse/client": new URL(
          "./packages/client/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/tracing": new URL(
          "./packages/tracing/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/otel": new URL(
          "./packages/otel/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/langchain": new URL(
          "./packages/langchain/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/openai": new URL(
          "./packages/openai/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/vercel-ai-sdk": new URL(
          "./packages/vercel-ai-sdk/dist/index.mjs",
          import.meta.url,
        ).pathname,
        "@langfuse/core": new URL(
          "./packages/core/dist/index.mjs",
          import.meta.url,
        ).pathname,
      },
    },
  },
]);
