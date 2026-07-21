![GitHub Banner](https://github.com/user-attachments/assets/5810ae13-15d6-4b60-afd2-927adc501861)

# @langfuse/vercel-ai-sdk

[Langfuse](https://langfuse.com) is the open-source LLM engineering platform: tracing & evaluation for LLM and agent applications, prompt management, datasets & experiments, and evaluation (scores). This package provides the **Langfuse telemetry integration for Vercel AI SDK v7** (`ai@7`) using the callback-based telemetry system — every `generateText` / `streamText` / `generateObject` / `embed` call is traced as Langfuse observations. Span export requires the `LangfuseSpanProcessor` from [`@langfuse/otel`](https://www.npmjs.com/package/@langfuse/otel); prompt management, datasets/experiments, and evals/scores live in [`@langfuse/client`](https://www.npmjs.com/package/@langfuse/client). For AI SDK ≤ 6, this package is not needed — use `experimental_telemetry: { isEnabled: true }` instead (see the [integration guide](https://langfuse.com/integrations/frameworks/vercel-ai-sdk)).

It delegates AI SDK-compatible OpenTelemetry span creation to Vercel's `@ai-sdk/otel` package so it works with the existing Langfuse OTEL ingestion pipeline. Runtime context keys included via AI SDK telemetry are attached as Langfuse observation metadata. The only special runtime context key is `langfusePrompt`, which links Langfuse prompt name and version to model-call observations.

Trace-level attributes such as user ID, session ID, tags, trace name, and trace metadata should be set with `propagateAttributes` from `@langfuse/tracing`.

## Compatibility

This integration targets AI SDK v7 GA. Install it together with `ai@^7`; the package depends on the matching `@ai-sdk/otel` integration internally.

```sh
pnpm add @langfuse/vercel-ai-sdk @langfuse/otel ai
```

## Environment variables

```bash
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com" # 🇪🇺 EU region. 🇺🇸 US: https://us.cloud.langfuse.com
```

`LANGFUSE_BASE_URL` is the canonical spelling.

## Setup

Register the `LangfuseSpanProcessor` and the integration once at application startup (in Next.js: [`instrumentation.ts`](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)):

```ts
// instrumentation.ts
import { registerTelemetry } from "ai";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { NodeSDK } from "@opentelemetry/sdk-node";

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();

registerTelemetry(new LangfuseVercelAiSdkIntegration());
```

See the [full guide](https://langfuse.com/integrations/frameworks/vercel-ai-sdk) for the complete Next.js recipe including streaming, user/session attribution, and serverless flushing, and the [@langfuse/tracing README](https://github.com/langfuse/langfuse-js/tree/main/packages/tracing) for a condensed version.

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
        route: "support-chat",
        langfusePrompt: {
          name: "assistant/default",
          version: 3,
          isFallback: false,
        },
      },
      telemetry: {
        functionId: "chat-assistant",
        includeRuntimeContext: {
          route: true,
          langfusePrompt: true,
        },
      },
    }),
);
```

AI SDK v7 excludes `runtimeContext` from telemetry events unless each top-level key is explicitly included. This integration maps every included runtime context key to Langfuse observation metadata, except `langfusePrompt`, which is used for prompt linking and is not added as metadata.

You can also pass the integration on a single call:

```ts
import { generateText } from "ai";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";

await generateText({
  model,
  prompt: "Summarize this article",
  runtimeContext: {
    feature: "article-summary",
  },
  telemetry: {
    functionId: "article-summary",
    includeRuntimeContext: {
      feature: true,
    },
    integrations: new LangfuseVercelAiSdkIntegration(),
  },
});
```

## Packages

| Package                                                                                             | NPM                                                                                                                       | Description                                               | Environments |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| [@langfuse/client](https://github.com/langfuse/langfuse-js/tree/main/packages/client)               | [![NPM](https://img.shields.io/npm/v/@langfuse/client.svg)](https://www.npmjs.com/package/@langfuse/client)               | Langfuse API client for universal JavaScript environments | Universal JS |
| [@langfuse/tracing](https://github.com/langfuse/langfuse-js/tree/main/packages/tracing)             | [![NPM](https://img.shields.io/npm/v/@langfuse/tracing.svg)](https://www.npmjs.com/package/@langfuse/tracing)             | Langfuse instrumentation methods based on OpenTelemetry   | Node.js 20+  |
| [@langfuse/otel](https://github.com/langfuse/langfuse-js/tree/main/packages/otel)                   | [![NPM](https://img.shields.io/npm/v/@langfuse/otel.svg)](https://www.npmjs.com/package/@langfuse/otel)                   | Langfuse OpenTelemetry export helpers                     | Node.js 20+  |
| [@langfuse/openai](https://github.com/langfuse/langfuse-js/tree/main/packages/openai)               | [![NPM](https://img.shields.io/npm/v/@langfuse/openai.svg)](https://www.npmjs.com/package/@langfuse/openai)               | Langfuse integration for OpenAI SDK                       | Universal JS |
| [@langfuse/langchain](https://github.com/langfuse/langfuse-js/tree/main/packages/langchain)         | [![NPM](https://img.shields.io/npm/v/@langfuse/langchain.svg)](https://www.npmjs.com/package/@langfuse/langchain)         | Langfuse integration for LangChain                        | Universal JS |
| [@langfuse/vercel-ai-sdk](https://github.com/langfuse/langfuse-js/tree/main/packages/vercel-ai-sdk) | [![NPM](https://img.shields.io/npm/v/@langfuse/vercel-ai-sdk.svg)](https://www.npmjs.com/package/@langfuse/vercel-ai-sdk) | Langfuse integration for AI SDK v7                        | Universal JS |
| [@langfuse/browser](https://github.com/langfuse/langfuse-js/tree/main/packages/browser)             | [![NPM](https://img.shields.io/npm/v/@langfuse/browser.svg)](https://www.npmjs.com/package/@langfuse/browser)             | Browser score ingestion with public-key auth              | Browser      |
| [@langfuse/core](https://github.com/langfuse/langfuse-js/tree/main/packages/core)                   | [![NPM](https://img.shields.io/npm/v/@langfuse/core.svg)](https://www.npmjs.com/package/@langfuse/core)                   | Shared core: generated API client, logger, utilities      | Universal JS |

## Documentation

- Vercel AI SDK integration guide: https://langfuse.com/integrations/frameworks/vercel-ai-sdk
- Docs: https://langfuse.com/docs/observability/sdk/overview
- Reference: https://js.reference.langfuse.com
- LLM/agent-readable docs index: https://langfuse.com/llms.txt

## License

[MIT](LICENSE)
