![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# @langfuse/tracing

[Langfuse](https://langfuse.com) is the open-source LLM engineering platform: tracing & observability for LLM and agent applications, prompt management, datasets & experiments, and evaluation (scores). This package provides the **tracing instrumentation** primitives of the Langfuse JS SDK, built on OpenTelemetry: `startObservation`, `startActiveObservation`, the `observe()` wrapper, and `propagateAttributes` for user/session attribution and prompt linking. It pairs with the `LangfuseSpanProcessor` from [`@langfuse/otel`](https://www.npmjs.com/package/@langfuse/otel), which exports the spans to Langfuse. Prompt management, datasets/experiments, evals/scores, and the full REST API live in [`@langfuse/client`](https://www.npmjs.com/package/@langfuse/client).

> [!IMPORTANT]
> This is the current SDK generation (`@langfuse/*` scoped packages). The unscoped `langfuse` npm package is the legacy v3 SDK — for new integrations use `@langfuse/tracing` + `@langfuse/otel`. Migration guides: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).

## Install

```bash
npm install @langfuse/tracing @langfuse/otel @opentelemetry/sdk-trace-node
```

## Environment variables

```bash
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com" # 🇪🇺 EU region. 🇺🇸 US: https://us.cloud.langfuse.com
```

`LANGFUSE_BASE_URL` is the canonical spelling (identical to the Python SDK). The legacy JS v2/v3 spelling `LANGFUSE_BASEURL` is still accepted as a fallback.

## Quickstart: Next.js + Vercel AI SDK

The most common setup: trace `streamText` / `generateText` calls in a Next.js app, with user and session attribution, and reliable span delivery on serverless.

**1. Register the span processor in [`instrumentation.ts`](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation):**

```typescript
// instrumentation.ts (project root)
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

// Exported so route handlers can flush it before the serverless
// function is frozen or terminated.
export const langfuseSpanProcessor = new LangfuseSpanProcessor();

export function register() {
  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [langfuseSpanProcessor],
  });

  tracerProvider.register();
}
```

With **AI SDK 7** (`ai@7`), additionally register the Langfuse telemetry integration from [`@langfuse/vercel-ai-sdk`](https://www.npmjs.com/package/@langfuse/vercel-ai-sdk) inside `register()`:

```typescript
import { registerTelemetry } from "ai";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";

registerTelemetry(new LangfuseVercelAiSdkIntegration());
```

With **AI SDK ≤ 6**, no integration package is needed — instead pass `experimental_telemetry: { isEnabled: true }` on each `generateText` / `streamText` call and the `LangfuseSpanProcessor` picks the spans up.

**2. Trace the route handler with user/session attribution:**

```typescript
// app/api/chat/route.ts
import { openai } from "@ai-sdk/openai";
import {
  observe,
  propagateAttributes,
  updateActiveObservation,
} from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { streamText, type UIMessage } from "ai";
import { after } from "next/server";

import { langfuseSpanProcessor } from "@/instrumentation";

const handler = async (req: Request) => {
  const {
    messages,
    chatId,
    userId,
  }: { messages: UIMessage[]; chatId: string; userId: string } =
    await req.json();

  updateActiveObservation({ input: messages });

  // userId / sessionId / tags / metadata set here are applied to every
  // span created inside the callback — call this as early as possible.
  return propagateAttributes(
    { traceName: "chat-message", userId, sessionId: chatId },
    async () => {
      const result = streamText({
        model: openai("gpt-5.1"),
        messages,
        // AI SDK ≤ 6 only: experimental_telemetry: { isEnabled: true },
        onFinish: async (result) => {
          updateActiveObservation({ output: result.content });
          // End the root observation once the stream has finished
          trace.getActiveSpan()?.end();
        },
        onError: async (error) => {
          updateActiveObservation({ output: error });
          trace.getActiveSpan()?.end();
        },
      });

      // Critical on serverless: export spans before the function freezes
      after(async () => await langfuseSpanProcessor.forceFlush());

      return result.toUIMessageStreamResponse();
    },
  );
};

// observe() wraps the handler in a root observation
export const POST = observe(handler, {
  name: "handle-chat-message",
  endOnExit: false, // ended manually in onFinish after the stream completes
});
```

See the full guide at https://langfuse.com/integrations/frameworks/vercel-ai-sdk.

## Quickstart: any Node.js app

```typescript
import { startActiveObservation, startObservation } from "@langfuse/tracing";

await startActiveObservation("user-request", async (span) => {
  span.update({ input: { query: "What is Langfuse?" } });

  // Nested observation, e.g. an LLM call, typed as a generation
  const generation = startObservation(
    "llm-call",
    {
      model: "gpt-5.1",
      input: [{ role: "user", content: "What is Langfuse?" }],
    },
    { asType: "generation" },
  );
  // ... call your LLM ...
  generation.update({
    output: { role: "assistant", content: "..." },
    usageDetails: { input: 12, output: 156 },
  });
  generation.end();

  span.update({ output: "done" });
});
```

Key exports:

- `startObservation` / `startActiveObservation` — create spans, generations, agents, tools, and other observation types
- `observe()` — wrap any existing function with tracing
- `propagateAttributes()` — set `userId`, `sessionId`, `tags`, `metadata`, `version`, and prompt links on all spans created within a callback
- `createTraceId()` — deterministic trace IDs for correlating external IDs
- `updateActiveObservation`, `getActiveTraceId`, `setActiveTraceAsPublic`

## Serverless checklist

1. Consider `new LangfuseSpanProcessor({ exportMode: "immediate" })` so spans are not held in a batch.
2. Always `await langfuseSpanProcessor.forceFlush()` before the function instance is frozen (e.g. Vercel `after()`, `waitUntil()`).
3. For streaming responses, end the root observation in `onFinish` (see the recipe above) so it is included in the flush.

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
- Instrumentation guide: https://langfuse.com/docs/observability/sdk/instrumentation
- API reference: https://js.reference.langfuse.com
- LLM/agent-readable docs index: https://langfuse.com/llms.txt

## License

[MIT](LICENSE)
