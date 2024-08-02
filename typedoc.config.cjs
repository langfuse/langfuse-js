/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  entryPoints: ["./langfuse", "./langfuse-core", "./langfuse-langchain", "./langfuse-node", "./langfuse-vercel"],
  entryPointStrategy: "packages",
  name: "Langfuse JS/TS SDKs",
  plugin: ["typedoc-plugin-missing-exports"],
  navigationLinks: {
    GitHub: "http://github.com/langfuse/langfuse-js",
    Docs: "https://langfuse.com/docs/sdk/typescript",
  },
};
