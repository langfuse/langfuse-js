![GitHub Banner](https://github.com/user-attachments/assets/5810ae13-15d6-4b60-afd2-927adc501861)

# @langfuse/client

[Langfuse](https://langfuse.com) is the open-source LLM engineering platform: tracing & evaluation for LLM and agent applications, prompt management, datasets & experiments, and evaluation (scores). This package provides the **`LangfuseClient`** — prompt management (`langfuse.prompt`), datasets (`langfuse.dataset`), experiments (`langfuse.experiment`), scores (`langfuse.score`), media (`langfuse.media`), and the full generated REST API client (`langfuse.api`). Tracing is intentionally separate: use [`@langfuse/tracing`](https://www.npmjs.com/package/@langfuse/tracing) + [`@langfuse/otel`](https://www.npmjs.com/package/@langfuse/otel) for that.

> [!IMPORTANT]
> This is the current SDK generation (`@langfuse/*` scoped packages). The unscoped `langfuse` npm package is the legacy v3 SDK — for new integrations use the `@langfuse/*` packages. Migration guides: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).

## Install

```bash
npm install @langfuse/client
```

## Environment variables

```bash
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com" # 🇪🇺 EU region. 🇺🇸 US: https://us.cloud.langfuse.com
```

## Quickstart

```typescript
import { LangfuseClient } from "@langfuse/client";

const langfuse = new LangfuseClient(); // reads env vars

// Prompt management
const prompt = await langfuse.prompt.get("my-prompt");
const compiled = prompt.compile({ topic: "chickens" });

// Scores (evaluation / user feedback)
langfuse.score.create({ traceId: "trace-id", name: "quality", value: 0.9 });
await langfuse.flush(); // flush queued scores (tracing spans flush separately)

// Datasets & experiments
const dataset = await langfuse.dataset.get("my-dataset");
const result = await dataset.runExperiment({
  name: "My experiment",
  task: async ({ input }) => myModel.generate(input),
  evaluators: [
    async ({ output, expectedOutput }) => ({
      name: "exact_match",
      value: output === expectedOutput ? 1 : 0,
    }),
  ],
});
console.log(await result.format());

// Full REST API
const trace = await langfuse.api.trace.get("trace-id");
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

- Prompt management: https://langfuse.com/docs/prompt-management/get-started
- Experiments: https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk
- Scores: https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk
- Reference: https://js.reference.langfuse.com
- LLM/agent-readable docs index: https://langfuse.com/llms.txt

## License

[MIT](LICENSE)
