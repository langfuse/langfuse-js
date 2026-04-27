# Agent Guidelines for Langfuse JS

This is the repository-level guide for Codex and other coding agents working on
`langfuse-js`. Keep it concise, practical, and updated when the repo's
architecture, commands, release process, or durable coding conventions change.

Langfuse JS is a pnpm/Turbo monorepo for the Langfuse JavaScript and TypeScript
SDK packages.

## Start Here By Task

- Core API/client work: `packages/core`, `packages/client`
- Tracing and OpenTelemetry behavior: `packages/tracing`, `packages/otel`
- Framework integrations: `packages/openai`, `packages/langchain`
- Package-level generated docs/reference output: `typedoc.config.cjs` and
  `packages/*/typedoc.config.cjs`
- Local integration tests that do not need a running Langfuse server:
  `tests/integration`
- End-to-end tests against a Langfuse server: `tests/e2e`

Read the closest package README before changing public SDK behavior or examples.

## Project Structure

```text
langfuse-js/
|-- packages/core/        # Shared API client, types, constants, logger, media
|-- packages/client/      # Universal Langfuse client
|-- packages/tracing/     # OpenTelemetry-based tracing primitives
|-- packages/otel/        # Node-specific OpenTelemetry export helpers
|-- packages/openai/      # OpenAI SDK integration
|-- packages/langchain/   # LangChain integration
`-- tests/                # Integration and e2e suites
```

Dependency direction:

- `@langfuse/core` is the base package.
- `@langfuse/client` depends on `@langfuse/core` and `@langfuse/tracing`.
- `@langfuse/tracing` and `@langfuse/otel` may depend on `@langfuse/core`.
- `@langfuse/openai` and `@langfuse/langchain` depend on tracing/core packages.
- Keep universal packages free of Node built-ins. `packages/otel` is the
  Node-specific exception.

## Core Commands

- Install dependencies: `pnpm install`
- Build all packages: `pnpm build`
- Unit tests: `pnpm test`
- Integration tests: `pnpm test:integration`
- E2E tests: `pnpm test:e2e`
- Lint: `pnpm lint`
- Lint fix: `pnpm lint:fix`
- Typecheck: `pnpm typecheck`
- Format: `pnpm format`
- Format check: `pnpm format:check`
- Full CI-equivalent check: `pnpm ci`
- Codex cloud setup: `bash scripts/codex/setup.sh`
- Codex cloud maintenance: `bash scripts/codex/maintenance.sh`

Minimum verification matrix:

| Change scope                               | Minimum verification                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Package source only                        | `pnpm lint` + `pnpm typecheck` + targeted `pnpm test -- <pattern>`                             |
| Integration behavior                       | `pnpm test:integration` after `pnpm build` if not run by the script                            |
| E2E/server behavior                        | `pnpm test:e2e` with `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY` set |
| Formatting/docs-only changes               | `pnpm format:check`                                                                            |
| Cross-package or release-sensitive changes | `pnpm ci` when feasible                                                                        |

If a required check cannot run because credentials or a Langfuse server are not
available, say that explicitly in the final response.

## Coding Rules

- Prefer TypeScript-first APIs and preserve ESM/CJS package exports.
- Keep public SDK APIs backward compatible unless the task is explicitly a
  breaking change.
- Add or update tests for behavior changes. For bug fixes, prefer writing or
  identifying a failing regression test before changing implementation.
- Keep tests independent and parallel-safe. Avoid relying on test execution
  order or shared mutable state.
- Follow the existing ESLint import ordering and Prettier formatting.
- Use workspace dependencies (`workspace:^`) for internal package links.
- Do not hand-edit generated build outputs, package `dist/` directories,
  TypeScript build info, coverage output, or Typedoc output.
- Keep `.env.example` in sync when adding required environment variables.
- Never commit secrets. Use local `.env` files or CI/Codex secrets.

## Release and PR Rules

- Commit messages and PR titles must follow Conventional Commits:
  `type(scope): description` or `type: description`.
- Allowed common types include `feat`, `fix`, `docs`, `style`, `refactor`,
  `perf`, `test`, `build`, `ci`, `chore`, `revert`, and `security`.
- All packages use lockstep versioning; avoid changing package versions outside
  the release flow.
- PR descriptions should list impacted packages and executed verification
  commands.
- Update `CHANGELOG.md` only as part of the release process unless a maintainer
  explicitly asks for a manual changelog edit.

## Git and Tooling Notes

- Keep changes scoped; avoid unrelated refactors.
- Do not revert unrelated working-tree changes.
- Do not use destructive git commands such as `git reset --hard` unless the
  user explicitly asks for them.
- Prefer `rg` for code search.
- Use `pnpm` rather than npm or yarn.
