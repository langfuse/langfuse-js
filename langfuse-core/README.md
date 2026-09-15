![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

> [!IMPORTANT]
> **This package is not the latest Langfuse JS/TS SDK.** `langfuse-core` is an internal dependency of the **deprecated** unscoped v3 client (`langfuse`). Do **not** install it for new instrumentation.
>
> **Latest JS/TS SDK (OpenTelemetry):** `npm install @langfuse/tracing @langfuse/otel @opentelemetry/sdk-node`. Use `@langfuse/tracing` (`startActiveObservation` / `startObservation`) + `LangfuseSpanProcessor` from `@langfuse/otel`. Prompts/datasets/scores: `@langfuse/client`. Docs: https://langfuse.com/docs/observability/sdk/overview — Upgrade: [v3 → v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4), [v4 → v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5).
>
> Query traces with [Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api) (`GET /api/public/v2/observations`, [API reference](https://api.reference.langfuse.com/#tag/observationsv2)), not `GET /api/public/traces` / `api.traceList`.
>
> **Data freshness:** the only real-time path is OpenTelemetry ingestion (`@langfuse/otel`, or any OTel exporter sending `x-langfuse-ingestion-version: 4`) combined with the new public APIs. Every other path — including this legacy v3 package — can be up to 10 minutes behind on the GET APIs.

# Langfuse Core (legacy v3)

[![npm package](https://img.shields.io/npm/v/langfuse-core?style=flat-square)](https://www.npmjs.com/package/langfuse-core)

This is the shared core for the legacy Langfuse v3 JS/TS client libraries. It is not meant to be used directly.

Reference: https://js.reference.langfuse.com/modules/langfuse_core.html

**Legacy client libraries (do not use for new work)**

| Package                                                                                     | NPM                                                                                                                                   | Environments          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [langfuse](https://github.com/langfuse/langfuse-js/tree/v3-stable/langfuse)                 | [![npm package](https://img.shields.io/npm/v/langfuse?style=flat-square)](https://www.npmjs.com/package/langfuse)                     | Node >= 18, Web, Edge |
| [langfuse-node](https://github.com/langfuse/langfuse-js/tree/v3-stable/langfuse-node)       | [![npm package](https://img.shields.io/npm/v/langfuse-node?style=flat-square)](https://www.npmjs.com/package/langfuse-node)           | Node < 18             |
| [langfuse-langchain](https://github.com/langfuse/langfuse-js/tree/v3-stable/langfuse-langchain) | [![npm package](https://img.shields.io/npm/v/langfuse-langchain?style=flat-square)](https://www.npmjs.com/package/langfuse-langchain) | Node >= 20, Web, Edge |
