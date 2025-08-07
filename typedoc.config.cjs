/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  entryPoints: [
    "./packages/core",
    "./packages/client",
    "./packages/langchain",
    "./packages/openai",
    "./packages/otel",
    "./packages/tracing",
  ],
  entryPointStrategy: "packages",
  name: "Langfuse JS/TS SDKs",
  navigationLinks: {
    GitHub: "http://github.com/langfuse/langfuse-js",
    Docs: "https://langfuse.com/docs/sdk/typescript",
  },
};
