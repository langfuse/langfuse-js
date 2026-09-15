![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# (Beta) Langfuse Vercel AI SDK Integration JS/TS

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT) [![npm package](https://img.shields.io/npm/v/langfuse-langchain?style=flat-square)](https://www.npmjs.com/package/langfuse) [![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse) [![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU) [![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

> [!IMPORTANT]
> **This package is not the latest Langfuse JS/TS SDK.** `langfuse-vercel` is the **deprecated** v3 Vercel AI SDK integration. Do **not** use it for new instrumentation.
>
> **Latest setup:** `npm install @langfuse/otel @langfuse/tracing @opentelemetry/sdk-node` (AI SDK ≤6: `experimental_telemetry` + `@langfuse/otel`). For AI SDK v7 (`ai@7`), use [`@langfuse/vercel-ai-sdk`](https://www.npmjs.com/package/@langfuse/vercel-ai-sdk). Docs: https://langfuse.com/integrations/frameworks/vercel-ai-sdk — Upgrade: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).
>
> Query traces with [Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api) (`GET /api/public/v2/observations`, [API reference](https://api.reference.langfuse.com/#tag/observationsv2)), not `GET /api/public/traces` / `api.traceList`.
>
> **Data freshness:** the only real-time path is OpenTelemetry ingestion (`@langfuse/otel`, or any OTel exporter sending `x-langfuse-ingestion-version: 4`) combined with the [Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api) and [Metrics API v2](https://langfuse.com/docs/metrics/features/metrics-api). All other GET APIs from all SDK packages can be up to 10 minutes behind.

This is the JS/TS client for the Langfuse Vercel AI SDK integration. This integration is currently in beta and functionality and interfaces may change.

## Documentation

- Docs: https://langfuse.com/docs/integrations/vercel
- Reference: https://js.reference.langfuse.com/modules/langfuse_vercel.html

## Environments

**Supported**

- Node.js >=20
- Edge: Vercel, Cloudflare Workers, etc.

## Installation

```bash
npm i langfuse-vercel
# or
yarn add langfuse-vercel
# or
pnpm i langfuse-vercel
```
