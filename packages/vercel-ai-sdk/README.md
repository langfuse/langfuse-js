![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# @langfuse/vercel-ai-sdk

This package provides a Langfuse-owned telemetry integration for AI SDK v7 (`ai@7`) using the new callback-based telemetry system.

It emits AI SDK-compatible OpenTelemetry spans so it works with the existing Langfuse OTEL ingestion pipeline, and it adds Langfuse-specific trace and prompt attributes for user/session/tag/prompt linking.

## Usage

```ts
import { generateText } from "ai";
import { createLangfuseTelemetry } from "@langfuse/vercel-ai-sdk";

await generateText({
  model,
  prompt: "Explain RAG in one paragraph",
  experimental_telemetry: createLangfuseTelemetry({
    functionId: "chat-assistant",
    userId: "user-123",
    sessionId: "session-456",
    tags: ["production", "chat"],
    metadata: {
      feature: "assistant",
    },
    prompt: {
      name: "assistant/default",
      version: 3,
      isFallback: false,
    },
  }),
});
```

For global registration, pass the integration once and provide per-call Langfuse context via `runtimeContext.langfuse`:

```ts
import { generateText, registerTelemetry } from "ai";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";

registerTelemetry(new LangfuseVercelAiSdkIntegration());

await generateText({
  model,
  prompt: "Summarize this article",
  runtimeContext: {
    langfuse: {
      userId: "user-123",
      sessionId: "session-456",
      tags: ["summaries"],
      metadata: {
        feature: "article-summary",
      },
    },
  },
  experimental_telemetry: {
    functionId: "article-summary",
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
