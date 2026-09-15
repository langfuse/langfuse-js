![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# langfuse-js

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI test status](https://img.shields.io/github/actions/workflow/status/langfuse/langfuse-js/ci.yml?style=flat-square&label=All%20tests)](https://github.com/langfuse/langfuse-js/actions/workflows/ci.yml?query=branch%3Amain)
[![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse)
[![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU)
[![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

> [!IMPORTANT]
> **`langfuse` on npm is not the latest Langfuse JS/TS SDK.** This branch publishes the **deprecated** v3 client (`langfuse`, `langfuse-node`, `langfuse-langchain`, `langfuse-vercel`). `npm install langfuse` installs that legacy client (`new Langfuse()`, `trace()`, `span()`, `api.traceList`). Do **not** use it for new instrumentation.
>
> **Latest JS/TS SDK (OpenTelemetry)** — developed on [`main`](https://github.com/langfuse/langfuse-js/tree/main): `npm install @langfuse/tracing @langfuse/otel @opentelemetry/sdk-node`. Use `@langfuse/tracing` (`startActiveObservation` / `startObservation`) + `LangfuseSpanProcessor` from `@langfuse/otel`. Prompts/datasets/scores: `@langfuse/client`. Docs: https://langfuse.com/docs/observability/sdk/overview — Upgrade: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).
>
> Query traces with [Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api) (`GET /api/public/v2/observations`, [API reference](https://api.reference.langfuse.com/#tag/observationsv2)), not `GET /api/public/traces` / `api.traceList`.
>
> **Data freshness:** the only real-time path is OpenTelemetry ingestion (`@langfuse/otel`, or any OTel exporter sending `x-langfuse-ingestion-version: 4`) combined with the new public APIs. Every other path — including these legacy v3 packages — can be up to 10 minutes behind on the GET APIs.

Modular mono repo for the **legacy v3** Langfuse JS/TS client libraries (maintenance mode; critical bug fixes only).

## Packages

| Package                                                                                     | NPM                                                                                                                                   | Environments          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [langfuse](https://github.com/langfuse/langfuse-js/tree/main/langfuse)                      | [![npm package](https://img.shields.io/npm/v/langfuse?style=flat-square)](https://www.npmjs.com/package/langfuse)                     | Node >= 18, Web, Edge |
| [langfuse-node](https://github.com/langfuse/langfuse-js/tree/main/langfuse-node)            | [![npm package](https://img.shields.io/npm/v/langfuse-node?style=flat-square)](https://www.npmjs.com/package/langfuse-node)           | Node < 18             |
| [langfuse-langchain](https://github.com/langfuse/langfuse-js/tree/main/langfuse-langchain)  | [![npm package](https://img.shields.io/npm/v/langfuse-langchain?style=flat-square)](https://www.npmjs.com/package/langfuse-langchain) | Node >= 20, Web, Edge |
| [langfuse-vercel (beta)](https://github.com/langfuse/langfuse-js/tree/main/langfuse-vercel) | [![npm package](https://img.shields.io/npm/v/langfuse-vercel?style=flat-square)](https://www.npmjs.com/package/langfuse-vercel)       | Node >= 20, Web, Edge |

## Documentation

- Current SDK docs: https://langfuse.com/docs/observability/sdk/overview
- Legacy v3 docs: https://langfuse.com/docs/sdk/typescript
- Reference: https://js.reference.langfuse.com

## License

[MIT](LICENSE)

## Credits

Thanks to the PostHog team for the awesome work on [posthog-js-lite](https://github.com/PostHog/posthog-js-lite). This project is based on it as it was the best starting point to build a modular SDK repo to support various environments.
