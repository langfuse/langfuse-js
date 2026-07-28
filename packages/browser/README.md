![GitHub Banner](https://github.com/user-attachments/assets/5810ae13-15d6-4b60-afd2-927adc501861)

# @langfuse/browser

[Langfuse](https://langfuse.com) is the open-source LLM engineering platform: tracing & evaluation for LLM and agent applications, prompt management, datasets & experiments, and evaluation (scores). This package provides the **browser client for score ingestion only** — e.g. capturing end-user feedback (thumbs up/down, ratings) from the frontend and attaching it to traces. It authenticates with the public key alone, so it is safe to ship to browsers. Everything else (tracing, prompt management, datasets/experiments, full API access) requires a secret key and lives in the server-side packages [`@langfuse/tracing`](https://www.npmjs.com/package/@langfuse/tracing), [`@langfuse/otel`](https://www.npmjs.com/package/@langfuse/otel), and [`@langfuse/client`](https://www.npmjs.com/package/@langfuse/client).

## Install

```bash
npm install @langfuse/browser
```

## Quickstart

```ts
import { LangfuseBrowserClient } from "@langfuse/browser";

const langfuse = new LangfuseBrowserClient({
  publicKey: "pk-lf-...",
  baseUrl: "https://cloud.langfuse.com", // 🇪🇺 EU region. 🇺🇸 US: https://us.cloud.langfuse.com 🇯🇵 Japan: https://jp.cloud.langfuse.com ⚕️ HIPAA: https://hipaa.cloud.langfuse.com
});

await langfuse.score({
  traceId: "trace-id",
  name: "user_feedback",
  value: 1,
});
```

This package only supports score ingestion and uses public-key Bearer auth.
**Do not pass Langfuse secret keys to browser code.** Configuration is passed
via the constructor (browsers have no `process.env`); server-side packages
read `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL`
environment variables instead.

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

- User feedback: https://langfuse.com/docs/observability/features/user-feedback
- Docs: https://langfuse.com/docs/observability/sdk/overview
- Reference: https://js.reference.langfuse.com
- LLM/agent-readable docs index: https://langfuse.com/llms.txt

## License

[MIT](LICENSE)
