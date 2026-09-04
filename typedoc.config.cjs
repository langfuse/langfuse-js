/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  entryPoints: [
    "./packages/core",
    "./packages/browser",
    "./packages/client",
    "./packages/langchain",
    "./packages/openai",
    "./packages/otel",
    "./packages/tracing",
    "./packages/vercel-ai-sdk",
  ],
  entryPointStrategy: "packages",
  name: "Langfuse JS/TS SDKs",
  // Emits <link rel="canonical"> on every page. Without it the site serves
  // the same content at both `/` and `/index.html` with nothing telling
  // search engines which one is canonical.
  hostedBaseUrl: "https://js.reference.langfuse.com/",
  navigationLinks: {
    GitHub: "https://github.com/langfuse/langfuse-js",
    Docs: "https://langfuse.com/docs/sdk/typescript",
  },
};
