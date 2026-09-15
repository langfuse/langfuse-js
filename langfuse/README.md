![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

> [!IMPORTANT]
> **This package is not the latest Langfuse JS/TS SDK.** `npm install langfuse` installs a **deprecated** v3 client (`new Langfuse()`, `trace()`, `span()`, `api.traceList`). Do **not** use it for new instrumentation.
>
> **Latest JS/TS SDK (OpenTelemetry):** `npm install @langfuse/tracing @langfuse/otel @opentelemetry/sdk-node`. Use `@langfuse/tracing` (`startActiveObservation` / `startObservation`) + `LangfuseSpanProcessor` from `@langfuse/otel`. Prompts/datasets/scores: `@langfuse/client`. Docs: https://langfuse.com/docs/observability/sdk/overview — Upgrade: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).
>
> Query traces with [Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api) (`GET /api/public/v2/observations`, [API reference](https://api.reference.langfuse.com/#tag/observationsv2)), not `GET /api/public/traces` / `api.traceList`.
>
> **Data freshness:** the only real-time path is OpenTelemetry ingestion (`@langfuse/otel`, or any OTel exporter sending `x-langfuse-ingestion-version: 4`) combined with the [Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api) and [Metrics API v2](https://langfuse.com/docs/metrics/features/metrics-api). All other GET APIs from all SDK packages can be up to 10 minutes behind.

# ⚠️ `langfuse` — Legacy Langfuse v3 SDK (maintenance mode)

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT) [![npm package](https://img.shields.io/npm/v/langfuse?style=flat-square)](https://www.npmjs.com/package/langfuse) [![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse) [![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU) [![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

This package is the **legacy v3** SDK. It is in maintenance mode and only receives critical bug fixes. The current Langfuse JS/TS SDK lives in the scoped `@langfuse/*` packages.

## Use the current SDK instead

```bash
npm install @langfuse/tracing @langfuse/otel @opentelemetry/sdk-node
# Optional: prompts, datasets, scores, REST API
npm install @langfuse/client
```

| Current package                                                                    | Use for                                                                               | Replaces (v3)                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| [`@langfuse/tracing`](https://www.npmjs.com/package/@langfuse/tracing)             | OpenTelemetry-based tracing (`startActiveObservation` / `startObservation`)           | `langfuse.trace()` / `.generation()` |
| [`@langfuse/otel`](https://www.npmjs.com/package/@langfuse/otel)                   | `LangfuseSpanProcessor` to export OTel spans to Langfuse                              | event ingestion in `langfuse`        |
| [`@langfuse/client`](https://www.npmjs.com/package/@langfuse/client)               | Prompts, datasets, scores, and other Langfuse API access                              | `langfuse.getPrompt()`, `api.*`      |
| [`@langfuse/openai`](https://www.npmjs.com/package/@langfuse/openai)               | OpenAI SDK auto-instrumentation                                                       | `observeOpenAI` from `langfuse`      |
| [`@langfuse/langchain`](https://www.npmjs.com/package/@langfuse/langchain)         | LangChain callback handler                                                            | `langfuse-langchain`                 |
| [`@langfuse/vercel-ai-sdk`](https://www.npmjs.com/package/@langfuse/vercel-ai-sdk) | Vercel AI SDK v7 integration (AI SDK ≤6: `experimental_telemetry` + `@langfuse/otel`) | `langfuse-vercel`                    |

- **Docs (current SDK):** https://langfuse.com/docs/observability/sdk/overview
- **Upgrade path:** [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5)

---

## Legacy v3 documentation

This is the **legacy** JS/TS client for Langfuse v3. Prefer the current SDK above for new work.

### Documentation

- Legacy docs: https://langfuse.com/docs/sdk/typescript
- Current SDK docs: https://langfuse.com/docs/observability/sdk/overview
- Reference: https://js.reference.langfuse.com/modules/langfuse.html

### Environments

**Supported**

- Node.js >=18
- Web
- Edge: Vercel, Cloudflare Workers, etc.

**Using Node.js <18?** Use [`langfuse-node`](https://www.npmjs.com/package/langfuse-node) instead as it does not use `fetch` and other Web APIs

### Installation (legacy v3 only)

Only install this package to maintain an existing v3 integration:

```bash
npm i langfuse
# or
yarn add langfuse
# or
pnpm i langfuse
```
