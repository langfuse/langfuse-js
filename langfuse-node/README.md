![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# langfuse-node

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT) [![npm package](https://img.shields.io/npm/v/langfuse-node?style=flat-square)](https://www.npmjs.com/package/langfuse-node) [![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse) [![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU) [![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

> [!IMPORTANT]
> **This package is not the latest Langfuse JS/TS SDK.** `langfuse-node` is part of the **deprecated** v3 client. Do **not** use it for new instrumentation.
>
> **Latest JS/TS SDK (OpenTelemetry, Node.js 20+):** `npm install @langfuse/tracing @langfuse/otel @opentelemetry/sdk-node`. Use `@langfuse/tracing` + `LangfuseSpanProcessor` from `@langfuse/otel`. Prompts/datasets/scores: `@langfuse/client`. Docs: https://langfuse.com/docs/observability/sdk/overview — Upgrade: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).
>
> Query traces from the current SDK with Observations API v2 (`GET /api/public/v2/observations`), not `GET /api/public/traces` / `api.traceList`.

This is the legacy Node.js client for Langfuse v3.

Do not install `langfuse` or `langfuse-node` for new work — use `@langfuse/tracing` + `@langfuse/otel` instead.

## Documentation

- Docs: https://langfuse.com/docs/sdk/typescript
- Reference: https://js.reference.langfuse.com/modules/langfuse_node.html

## Installation

```bash
npm i langfuse-node
# or
yarn add langfuse-node
# or
pnpm i langfuse-node
```
