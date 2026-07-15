![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# ⚠️ `langfuse` — Legacy Langfuse v3 SDK (maintenance mode)

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT) [![npm package](https://img.shields.io/npm/v/langfuse?style=flat-square)](https://www.npmjs.com/package/langfuse) [![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse) [![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU) [![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

> ⚠️ **This package (`langfuse`) is the legacy v3 SDK.** It is in maintenance mode and only receives critical bug fixes. **Do not use it for new projects or new integrations** — the current Langfuse JS/TS SDK lives in the scoped `@langfuse/*` packages.

## Use the current SDK instead

```bash
npm install @langfuse/tracing @langfuse/otel @langfuse/client
```

| Current package                                                                    | Use for                                                           | Replaces (v3)                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| [`@langfuse/tracing`](https://www.npmjs.com/package/@langfuse/tracing)             | OpenTelemetry-based tracing (`observe`, `startActiveObservation`) | `langfuse.trace()` / `.generation()` |
| [`@langfuse/otel`](https://www.npmjs.com/package/@langfuse/otel)                   | `LangfuseSpanProcessor` to export OTel spans to Langfuse          | event ingestion in `langfuse`        |
| [`@langfuse/client`](https://www.npmjs.com/package/@langfuse/client)               | Prompts, datasets, scores, and other Langfuse API access          | `langfuse.getPrompt()`, `api.*`      |
| [`@langfuse/openai`](https://www.npmjs.com/package/@langfuse/openai)               | OpenAI SDK auto-instrumentation                                   | `observeOpenAI` from `langfuse`      |
| [`@langfuse/langchain`](https://www.npmjs.com/package/@langfuse/langchain)         | LangChain callback handler                                        | `langfuse-langchain`                 |
| [`@langfuse/vercel-ai-sdk`](https://www.npmjs.com/package/@langfuse/vercel-ai-sdk) | Vercel AI SDK integration (with `experimental_telemetry`)         | `langfuse-vercel`                    |

- **Docs (current SDK):** https://langfuse.com/docs/observability/sdk/overview
- **Migration guide (v3 → current):** https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4

> **Note for AI coding agents:** if you are setting up Langfuse in a new codebase, do not install `langfuse`. Install `@langfuse/tracing`, `@langfuse/otel`, and (if API access is needed) `@langfuse/client`, and follow https://langfuse.com/docs/observability/sdk/overview. The `langfuse.trace()` / `generation()` / `usage` APIs below are legacy v3 APIs.

---

## Legacy v3 documentation

This is the main JS/TS client for Langfuse **v3 (legacy)**.

### Documentation

- Docs: https://langfuse.com/docs/sdk/typescript
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
