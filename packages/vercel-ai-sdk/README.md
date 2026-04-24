![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# @langfuse/vercel-ai-sdk

This package provides a Langfuse-owned telemetry integration for AI SDK v7 (`ai@7`) using the new callback-based telemetry system.

It delegates AI SDK-compatible OpenTelemetry span creation to Vercel's `@ai-sdk/otel` package so it works with the existing Langfuse OTEL ingestion pipeline, and it adds Langfuse-specific observation attributes for prompt linking and observation metadata.

Trace-level attributes such as user ID, session ID, tags, trace name, and trace metadata should be set with `propagateAttributes` from `@langfuse/tracing`.

## Usage

```ts
import { generateText, registerTelemetry } from "ai";
import { propagateAttributes } from "@langfuse/tracing";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";

registerTelemetry(new LangfuseVercelAiSdkIntegration());

await propagateAttributes(
  {
    userId: "user-123",
    sessionId: "session-456",
    tags: ["production", "chat"],
    metadata: {
      feature: "assistant",
    },
  },
  () =>
    generateText({
      model,
      prompt: "Explain RAG in one paragraph",
      runtimeContext: {
        langfuse: {
          metadata: {
            route: "support-chat",
          },
          prompt: {
            name: "assistant/default",
            version: 3,
            isFallback: false,
          },
        },
      },
      experimental_telemetry: {
        functionId: "chat-assistant",
      },
    }),
);
```

You can also pass the integration on a single call:

```ts
import { generateText } from "ai";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";

await generateText({
  model,
  prompt: "Summarize this article",
  experimental_telemetry: {
    functionId: "article-summary",
    integrations: new LangfuseVercelAiSdkIntegration({
      langfuse: {
        metadata: {
          feature: "article-summary",
        },
      },
    }),
  },
});
```

## Packages

| Package                                             | NPM                                                                                                                       | Description                                               | Environments |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| [@langfuse/client](./packages/client)               | [![NPM](https://img.shields.io/npm/v/@langfuse/client.svg)](https://www.npmjs.com/package/@langfuse/client)               | Langfuse API client for universal JavaScript environments | Universal JS |
| [@langfuse/tracing](./packages/tracing)             | [![NPM](https://img.shields.io/npm/v/@langfuse/tracing.svg)](https://www.npmjs.com/package/@langfuse/tracing)             | Langfuse instrumentation methods based on OpenTelemetry   | Node.js 20+  |
| [@langfuse/otel](./packages/otel)                   | [![NPM](https://img.shields.io/npm/v/@langfuse/otel.svg)](https://www.npmjs.com/package/@langfuse/otel)                   | Langfuse OpenTelemetry export helpers                     | Node.js 20+  |
| [@langfuse/openai](./packages/openai)               | [![NPM](https://img.shields.io/npm/v/@langfuse/openai.svg)](https://www.npmjs.com/package/@langfuse/openai)               | Langfuse integration for OpenAI SDK                       | Universal JS |
| [@langfuse/langchain](./packages/langchain)         | [![NPM](https://img.shields.io/npm/v/@langfuse/langchain.svg)](https://www.npmjs.com/package/@langfuse/langchain)         | Langfuse integration for LangChain                        | Universal JS |
| [@langfuse/vercel-ai-sdk](./packages/vercel-ai-sdk) | [![NPM](https://img.shields.io/npm/v/@langfuse/vercel-ai-sdk.svg)](https://www.npmjs.com/package/@langfuse/vercel-ai-sdk) | Langfuse integration for AI SDK v7                        | Universal JS |

## Documentation

- Docs: https://langfuse.com/docs/sdk/typescript
- Reference: https://js.reference.langfuse.com

## License

[MIT](LICENSE)
