# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Langfuse JS/TS SDK monorepo. Provides OpenTelemetry-based tracing, an API client, and integrations for OpenAI and LangChain. All packages are published under lockstep versioning.

## Package Architecture

```
packages/
├── core/       # Shared API client, types, constants, logger, media utilities
├── tracing/    # OpenTelemetry-based tracing primitives (depends: core)
├── client/     # Universal Langfuse API client (depends: core, tracing)
├── otel/       # Node.js-specific OTel export helpers (depends: core; Node-only)
├── openai/     # OpenAI SDK integration (depends: core, tracing)
└── langchain/  # LangChain integration (depends: core, tracing)
```

`@langfuse/core` is the foundation; everything else depends on it. Integration packages depend on core + tracing. All internal deps use `workspace:^`.

Each package builds with tsup to dual CJS/ESM output (`dist/index.cjs`, `dist/index.mjs`, `dist/index.d.ts`).

## Commands

```bash
pnpm install                    # Install deps (corepack-managed pnpm 10.x)
pnpm build                      # Build all packages (turbo)
pnpm test                       # Unit tests (vitest, happy-dom)
pnpm test:integration           # Integration tests with MockSpanExporter (requires build first)
pnpm test:e2e                   # E2E tests against real Langfuse server (requires build first)
pnpm lint                       # ESLint
pnpm lint:fix                   # ESLint with auto-fix
pnpm format                     # Prettier
pnpm format:check               # Prettier check
pnpm typecheck                  # TypeScript type checking
pnpm ci                         # Full CI: build + test + lint + typecheck + format:check
pnpm clean                      # Remove dist/ and tsbuildinfo
pnpm nuke                       # Full clean + reinstall
```

Run a single test file: `pnpm vitest run tests/integration/path/to/test.test.ts`

## Test Structure

- `packages/*/src/**/*.test.ts` and `packages/*/tests/**/*.test.ts` — unit tests (happy-dom env, no server)
- `tests/integration/` — integration tests using MockSpanExporter (no external services, but requires `pnpm build`)
- `tests/e2e/` — end-to-end tests against real Langfuse server (30s timeout)
- Config: `vitest.config.ts` (unit), `vitest.workspace.ts` (integration + e2e projects)

## Verification Matrix

| Change scope | Minimum verification |
|---|---|
| Single package source | `pnpm build` + `pnpm test` + `pnpm lint` for that package |
| Cross-package | `pnpm ci` (full build + test + lint + typecheck + format) |
| Integration behavior | `pnpm build && pnpm test:integration` |

## Key Rules

- Lockstep versioning: all packages release together at the same version.
- Do not hand-edit `dist/` or generated build artifacts.
- Conventional Commits required for PR titles (`type(scope): description`).
- ESLint enforces import ordering (builtin > external > internal > parent > sibling > index).
- Node.js built-in imports restricted in universal packages (allowed only in `@langfuse/otel`).
- Release via `pnpm release` or GitHub Actions workflow; uses release-it with npm Trusted Publishing.

## Environment Variables for E2E Tests

```
LANGFUSE_BASE_URL="http://localhost:3000"
LANGFUSE_PUBLIC_KEY="pk-lf-1234567890"
LANGFUSE_SECRET_KEY="sk-lf-1234567890"
OPENAI_API_KEY=<required for openai integration tests>
```

## Key Config Files

| File | Purpose |
|---|---|
| `turbo.json` | Task graph and caching |
| `tsconfig.base.json` | Base TS config (ES2019, strict, NodeNext) |
| `vitest.workspace.ts` | Integration + e2e test project definitions |
| `eslint.config.mjs` | Flat ESLint config |
| `.release-it.json` | Release configuration |
