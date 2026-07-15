![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# @langfuse/core

[Langfuse](https://langfuse.com) is the open-source LLM engineering platform: tracing & observability for LLM and agent applications, prompt management, datasets & experiments, and evaluation (scores). This is the **shared core package** of the Langfuse JS SDK: the generated REST API client (`LangfuseAPIClient`), logger, environment-variable handling, media types, and the `propagateAttributes` context propagation utilities. You usually don't install it directly — it is a dependency of the other `@langfuse/*` packages: use [`@langfuse/tracing`](https://www.npmjs.com/package/@langfuse/tracing) + [`@langfuse/otel`](https://www.npmjs.com/package/@langfuse/otel) for tracing and [`@langfuse/client`](https://www.npmjs.com/package/@langfuse/client) for prompt management, datasets/experiments, and scores.

> [!IMPORTANT]
> This is the current SDK generation (`@langfuse/*` scoped packages). The unscoped `langfuse-core` npm package belongs to the legacy v3 SDK. Migration guides: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).

## Environment variables

Configuration shared across all `@langfuse/*` packages:

```bash
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com" # 🇪🇺 EU region. 🇺🇸 US: https://us.cloud.langfuse.com
```

`LANGFUSE_BASE_URL` is the canonical spelling (identical to the Python SDK). The legacy JS v2/v3 spelling `LANGFUSE_BASEURL` is still accepted as a fallback. Additional options: `LANGFUSE_TIMEOUT`, `LANGFUSE_FLUSH_AT`, `LANGFUSE_FLUSH_INTERVAL`, `LANGFUSE_MEDIA_UPLOAD_ENABLED`, `LANGFUSE_TRACING_ENVIRONMENT`, `LANGFUSE_RELEASE`, `LANGFUSE_LOG_LEVEL`, `LANGFUSE_DEBUG`.

## Packages

| Package                                                                                             | NPM                                                                                                                       | Description                                                       | Environments |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------ |
| [@langfuse/tracing](https://github.com/langfuse/langfuse-js/tree/main/packages/tracing)             | [![NPM](https://img.shields.io/npm/v/@langfuse/tracing.svg)](https://www.npmjs.com/package/@langfuse/tracing)             | OpenTelemetry-based tracing instrumentation                       | Node.js 20+  |
| [@langfuse/otel](https://github.com/langfuse/langfuse-js/tree/main/packages/otel)                   | [![NPM](https://img.shields.io/npm/v/@langfuse/otel.svg)](https://www.npmjs.com/package/@langfuse/otel)                   | `LangfuseSpanProcessor` to export OpenTelemetry spans to Langfuse | Node.js 20+  |
| [@langfuse/client](https://github.com/langfuse/langfuse-js/tree/main/packages/client)               | [![NPM](https://img.shields.io/npm/v/@langfuse/client.svg)](https://www.npmjs.com/package/@langfuse/client)               | Prompt management, datasets, experiments, scores, full REST API   | Universal JS |
| [@langfuse/openai](https://github.com/langfuse/langfuse-js/tree/main/packages/openai)               | [![NPM](https://img.shields.io/npm/v/@langfuse/openai.svg)](https://www.npmjs.com/package/@langfuse/openai)               | `observeOpenAI` wrapper for tracing the OpenAI SDK                | Universal JS |
| [@langfuse/langchain](https://github.com/langfuse/langfuse-js/tree/main/packages/langchain)         | [![NPM](https://img.shields.io/npm/v/@langfuse/langchain.svg)](https://www.npmjs.com/package/@langfuse/langchain)         | `CallbackHandler` for LangChain / LangGraph tracing               | Universal JS |
| [@langfuse/vercel-ai-sdk](https://github.com/langfuse/langfuse-js/tree/main/packages/vercel-ai-sdk) | [![NPM](https://img.shields.io/npm/v/@langfuse/vercel-ai-sdk.svg)](https://www.npmjs.com/package/@langfuse/vercel-ai-sdk) | Telemetry integration for Vercel AI SDK v7                        | Universal JS |
| [@langfuse/browser](https://github.com/langfuse/langfuse-js/tree/main/packages/browser)             | [![NPM](https://img.shields.io/npm/v/@langfuse/browser.svg)](https://www.npmjs.com/package/@langfuse/browser)             | Browser score ingestion with public-key auth                      | Browser      |
| [@langfuse/core](https://github.com/langfuse/langfuse-js/tree/main/packages/core)                   | [![NPM](https://img.shields.io/npm/v/@langfuse/core.svg)](https://www.npmjs.com/package/@langfuse/core)                   | Shared core: generated API client, logger, utilities              | Universal JS |

## Documentation

- Docs: https://langfuse.com/docs/observability/sdk/overview
- API reference: https://js.reference.langfuse.com
- LLM/agent-readable docs index: https://langfuse.com/llms.txt

## License

[MIT](LICENSE)
