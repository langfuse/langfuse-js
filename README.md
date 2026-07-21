<img width="2400" height="600" alt="hero-b" src="https://github.com/user-attachments/assets/5810ae13-15d6-4b60-afd2-927adc501861" />

# langfuse-js

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI test status](https://img.shields.io/github/actions/workflow/status/langfuse/langfuse-js/ci.yml?style=flat-square&label=All%20tests)](https://github.com/langfuse/langfuse-js/actions/workflows/ci.yml?query=branch%3Amain)
[![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse)
[![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU)
[![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

Modular mono repo for the Langfuse JS/TS client libraries.

## Packages

> [!IMPORTANT]
> The SDK was rewritten in v5 and released in March 2026. Refer to the [v5 migration guide](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5) for instructions on updating your code.
>
> The unscoped npm packages `langfuse`, `langfuse-core`, `langfuse-node`, and `langfuse-langchain` belong to the legacy v3 SDK. For new integrations use the `@langfuse/*` scoped packages below — start with [@langfuse/tracing](./packages/tracing) + [@langfuse/otel](./packages/otel) for tracing.

| Package                                             | NPM                                                                                                                       | Description                                               | Environments |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| [@langfuse/client](./packages/client)               | [![NPM](https://img.shields.io/npm/v/@langfuse/client.svg)](https://www.npmjs.com/package/@langfuse/client)               | Langfuse API client for universal JavaScript environments | Universal JS |
| [@langfuse/browser](./packages/browser)             | [![NPM](https://img.shields.io/npm/v/@langfuse/browser.svg)](https://www.npmjs.com/package/@langfuse/browser)             | Langfuse browser SDK for public-key score ingestion       | Browser      |
| [@langfuse/tracing](./packages/tracing)             | [![NPM](https://img.shields.io/npm/v/@langfuse/tracing.svg)](https://www.npmjs.com/package/@langfuse/tracing)             | Langfuse instrumentation methods based on OpenTelemetry   | Node.js 20+  |
| [@langfuse/otel](./packages/otel)                   | [![NPM](https://img.shields.io/npm/v/@langfuse/otel.svg)](https://www.npmjs.com/package/@langfuse/otel)                   | Langfuse OpenTelemetry export helpers                     | Node.js 20+  |
| [@langfuse/openai](./packages/openai)               | [![NPM](https://img.shields.io/npm/v/@langfuse/openai.svg)](https://www.npmjs.com/package/@langfuse/openai)               | Langfuse integration for OpenAI SDK                       | Universal JS |
| [@langfuse/langchain](./packages/langchain)         | [![NPM](https://img.shields.io/npm/v/@langfuse/langchain.svg)](https://www.npmjs.com/package/@langfuse/langchain)         | Langfuse integration for LangChain                        | Universal JS |
| [@langfuse/vercel-ai-sdk](./packages/vercel-ai-sdk) | [![NPM](https://img.shields.io/npm/v/@langfuse/vercel-ai-sdk.svg)](https://www.npmjs.com/package/@langfuse/vercel-ai-sdk) | Langfuse integration for AI SDK v7                        | Universal JS |

## Documentation

- [Docs](https://langfuse.com/docs/observability/sdk/overview)
- [Reference](https://js.reference.langfuse.com)
- [LLM/agent-readable docs index](https://langfuse.com/llms.txt)

## Development

This is a monorepo managed with pnpm. See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed development instructions.

Quick start:

```bash
pnpm install    # Install dependencies
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm ci         # Run full CI suite
```

## License

[MIT](LICENSE)
