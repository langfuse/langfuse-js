![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# langfuse-js

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI test status](https://img.shields.io/github/actions/workflow/status/langfuse/langfuse-js/ci.yml?style=flat-square&label=All%20tests)](https://github.com/langfuse/langfuse-js/actions/workflows/ci.yml?query=branch%3Amain)
[![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse)
[![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU)
[![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

Modular mono repo for the Langfuse JS/TS client libraries.

## Packages

> [!IMPORTANT]
> The SDK was rewritten in v4 and released in August, 2025. Refer to the [v4 migration guide](https://langfuse.com/docs/sdk/typescript#updateToV4) for instructions on updating your code.

| Package                                     | NPM                                                                                                               | Description                                               | Environments |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| [@langfuse/client](./packages/client)       | [![NPM](https://img.shields.io/npm/v/@langfuse/client.svg)](https://www.npmjs.com/package/@langfuse/client)       | Langfuse API client for universal JavaScript environments | Universal JS |
| [@langfuse/tracing](./packages/tracing)     | [![NPM](https://img.shields.io/npm/v/@langfuse/tracing.svg)](https://www.npmjs.com/package/@langfuse/tracing)     | Langfuse instrumentation methods based on OpenTelemetry   | Node.js 20+  |
| [@langfuse/otel](./packages/otel)           | [![NPM](https://img.shields.io/npm/v/@langfuse/otel.svg)](https://www.npmjs.com/package/@langfuse/otel)           | Langfuse OpenTelemetry export helpers                     | Node.js 20+  |
| [@langfuse/openai](./packages/openai)       | [![NPM](https://img.shields.io/npm/v/@langfuse/openai.svg)](https://www.npmjs.com/package/@langfuse/openai)       | Langfuse integration for OpenAI SDK                       | Universal JS |
| [@langfuse/langchain](./packages/langchain) | [![NPM](https://img.shields.io/npm/v/@langfuse/langchain.svg)](https://www.npmjs.com/package/@langfuse/langchain) | Langfuse integration for LangChain                        | Universal JS |

## Documentation

- Docs: https://langfuse.com/docs/sdk/typescript
- Reference: https://js.reference.langfuse.com

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
