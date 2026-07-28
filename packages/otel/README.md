![GitHub Banner](https://github.com/user-attachments/assets/5810ae13-15d6-4b60-afd2-927adc501861)

# @langfuse/otel

[Langfuse](https://langfuse.com) is the open-source LLM engineering platform: tracing & evaluation for LLM and agent applications, prompt management, datasets & experiments, and evaluation (scores). This package provides the **`LangfuseSpanProcessor`** — the OpenTelemetry span processor that exports spans to Langfuse with smart filtering, masking, and media upload. Register it with any OTel setup and spans from [`@langfuse/tracing`](https://www.npmjs.com/package/@langfuse/tracing), the Vercel AI SDK, or any other GenAI instrumentation are sent to Langfuse. Prompt management, datasets/experiments, and evals/scores live in [`@langfuse/client`](https://www.npmjs.com/package/@langfuse/client).

> [!IMPORTANT]
> This is the current SDK generation (`@langfuse/*` scoped packages). The unscoped `langfuse` npm package is the legacy v3 SDK — for new integrations use `@langfuse/tracing` + `@langfuse/otel`. Migration guides: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).

## Install

```bash
npm install @langfuse/otel @opentelemetry/sdk-trace-node
```

## Environment variables

```bash
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com" # 🇪🇺 EU region. 🇺🇸 US: https://us.cloud.langfuse.com
```

## Quickstart

```typescript
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [langfuseSpanProcessor],
});

tracerProvider.register();
```

By default the processor exports Langfuse SDK spans, spans with `gen_ai.*`/`ai.*` attributes, and spans from known LLM instrumentation libraries — pass `shouldExportSpan` to override.

**Serverless / short-lived environments** (Vercel, AWS Lambda, Cloudflare Workers, edge): pass `exportMode: "immediate"` so spans are not held in a batch, and `await langfuseSpanProcessor.forceFlush()` before the function instance is frozen or terminated (e.g. inside Vercel's `after()` or the platform's `waitUntil()`). Spans still buffered when the process exits are lost.

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
- Vercel AI SDK / Next.js guide: https://langfuse.com/integrations/frameworks/vercel-ai-sdk
- Reference: https://js.reference.langfuse.com
- LLM/agent-readable docs index: https://langfuse.com/llms.txt

## License

[MIT](LICENSE)
