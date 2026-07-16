![GitHub Banner](https://github.com/user-attachments/assets/5810ae13-15d6-4b60-afd2-927adc501861)

# @langfuse/langchain

[Langfuse](https://langfuse.com) is the open-source LLM engineering platform: tracing & evaluations for LLM and agent applications, prompt management, datasets & experiments, and evaluation (scores). This package provides the **`CallbackHandler`** for tracing LangChain and LangGraph invocations with Langfuse. Spans are exported by the `LangfuseSpanProcessor` from [`@langfuse/otel`](https://www.npmjs.com/package/@langfuse/otel); prompt management, datasets/experiments, and evals/scores live in [`@langfuse/client`](https://www.npmjs.com/package/@langfuse/client).

> [!IMPORTANT]
> This is the current SDK generation (`@langfuse/*` scoped packages). The unscoped `langfuse-langchain` npm package belongs to the legacy v3 SDK — for new integrations use `@langfuse/langchain`. Migration guides: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).

## Install

```bash
npm install @langfuse/langchain @langfuse/otel @opentelemetry/sdk-trace-node
```

## Environment variables

```bash
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com" # 🇪🇺 EU region. 🇺🇸 US: https://us.cloud.langfuse.com
```

## Quickstart

```typescript
// Register the span processor once at startup
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

new NodeTracerProvider({
  spanProcessors: [new LangfuseSpanProcessor()],
}).register();

// Pass the CallbackHandler to your LangChain invocations
import { CallbackHandler } from "@langfuse/langchain";
import { ChatOpenAI } from "@langchain/openai";

const handler = new CallbackHandler({
  sessionId: "session-123",
  userId: "user-456",
});

const model = new ChatOpenAI({ model: "gpt-5.1" });
const response = await model.invoke("What is Langfuse?", {
  callbacks: [handler],
});
```

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

- LangChain integration guide: https://langfuse.com/integrations/frameworks/langchain
- Docs: https://langfuse.com/docs/observability/sdk/overview
- Reference: https://js.reference.langfuse.com
- LLM/agent-readable docs index: https://langfuse.com/llms.txt

## License

[MIT](LICENSE)
