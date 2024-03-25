/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
    entryPoints: ['./langfuse', './langfuse-core', './langfuse-langchain', './langfuse-node'],
    entryPointStrategy: "packages",
    name: "Langfuse JS/TS SDKs",
    "navigationLinks": {
        "GitHub": "http://github.com/langfuse/langfuse-js",
        "Docs": "https://langfuse.com/docs/sdk/typescript"
    }
};