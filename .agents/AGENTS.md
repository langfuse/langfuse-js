# Codex Guidelines for langfuse-js

This is the canonical root agent guide for the repo. The root `AGENTS.md`
should remain only as a discovery symlink so tools that require that filename
continue to work while `.agents/` stays the source of truth.

langfuse-js is the Langfuse JavaScript and TypeScript SDK monorepo.

## Maintenance Contract

- `AGENTS.md` is a living document.
- Update this file in the same PR when repo-level architecture, workflows,
  dependency boundaries, mandatory verification commands, or release/security
  processes materially change.
- Keep shared instructions concise, explicit, and anchored to real repo files,
  commands, and success criteria. Prefer concrete guidance over abstract
  prompting advice.
- Update this file when user feedback adds a durable repo-level instruction that
  future agents should follow. Update shared skill files under `skills/` as
  well when that feedback changes a reusable workflow, checklist, or decision
  rule those skills should teach.
- If no material guidance changed, do not edit AGENTS files or shared skills.

## Project Structure & Module Organization

```text
langfuse-js/
├─ packages/client/        # Universal Langfuse API client
├─ packages/core/          # Shared utilities, logger, types, API primitives
├─ packages/langchain/     # LangChain integration
├─ packages/openai/        # OpenAI SDK integration
├─ packages/otel/          # OpenTelemetry export helpers
├─ packages/tracing/       # Tracing helpers built on OpenTelemetry
├─ tests/integration/      # Local integration tests using MockSpanExporter
├─ tests/e2e/              # End-to-end tests against a Langfuse instance
└─ scripts/                # Repo-owned agent/bootstrap scripts
```

- Dependency direction:
  - `@langfuse/core` is the base package.
  - `@langfuse/tracing` and `@langfuse/otel` depend on `@langfuse/core`.
  - `@langfuse/client`, `@langfuse/openai`, and `@langfuse/langchain` depend
    on `@langfuse/core` and/or `@langfuse/tracing`.
- Keep shared protocol, transport, and tracing primitives in `packages/core`
  unless a package-specific boundary is clearly required.
- End-to-end test helpers live under `tests/e2e/helpers/`.
- Do not hand-edit generated/build artifacts such as `packages/*/dist/*` or
  Typedoc output under `docs/`.

## Build, Test, and Development Commands

- Install deps: `pnpm install`
- Agent/bootstrap setup: `bash scripts/codex/setup.sh`
- Watch package builds: `pnpm build --watch`
- Build all packages: `pnpm build`
- Run tests: `pnpm test`
- Run integration tests: `pnpm test:integration`
- Run end-to-end tests: `pnpm test:e2e`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Format check: `pnpm format:check`
- Full CI-equivalent pass: `pnpm ci`
- Target a single package when appropriate with `pnpm --filter <package> run build`
  or `pnpm --filter <package> run test`.

Tooling notes:

- Workspace builds are orchestrated by Turbo from `turbo.json`, while each
  package builds with `tsup`.
- Root linting uses the flat config in `eslint.config.mjs`, including import
  ordering rules and a restriction on Node built-ins in universal packages.
- Root tests run through `vitest.config.ts` with `happy-dom`, workspace source
  aliases, and typechecking enabled for test files.
- CI in `.github/workflows/ci.yml` runs integration tests, end-to-end tests
  against a cloned `langfuse/langfuse` server, and a build/lint/format job.

Minimum verification:

- Docs or config only: inspect the diff and run `pnpm format:check` when
  dependencies are available
- `.agents/**` or agent bootstrap changes: `node scripts/agents/sync-agent-shims.mjs --check`
- Single-package source changes: targeted package build/test where possible,
  then `pnpm lint` and `pnpm typecheck` for shared static checks
- Cross-package or public API changes: `pnpm build`, `pnpm test`, `pnpm lint`,
  and `pnpm typecheck`
- Changes that affect live platform integration behavior: `pnpm test:e2e` with
  a local Langfuse instance configured
- When in doubt: `pnpm ci`

## Coding Style & Naming Conventions

- Keep changes scoped; avoid unrelated refactors.
- Preserve package boundaries and public entrypoints declared in each
  `package.json`.
- Prefer adapting existing package conventions over introducing a new pattern
  for one file.
- Do not hand-edit generated build output in `dist/`.

## Testing Guidelines

- Keep tests independent and parallel-safe.
- Prefer small, testable increments for refactors or multi-step changes, and
  verify each material step before moving on.
- Integration tests should stay runnable without external services unless the
  scenario truly requires end-to-end coverage.
- End-to-end tests require a running Langfuse platform instance and the env vars
  documented in `CONTRIBUTING.md`.
- When fixing a bug, add or update the smallest test that proves the regression
  is covered.
- Treat tests and scripted checks as the repo's evals: if agent behavior,
  prompts, or tool wiring change, update the relevant verification coverage.

## Commit & Pull Request Guidelines

- Commit messages and PR titles should follow Conventional Commits:
  `type(scope): description` or `type: description`.
- Keep titles concise and imperative.
- In PR descriptions, list impacted packages and executed verification commands.
- Include AGENTS or shared skill updates in the same PR when durable repo
  guidance changes.
- Follow `.github/pull_request_template.md` by summarizing the problem, changes,
  release impact, and changelog notes.

## Docs & External References

- Contributor workflow details live in `CONTRIBUTING.md`.
- The separate docs repo may be available locally at `../langfuse-docs/`.
- Shared MCP config includes a `langfuse-docs` server so Cursor, Claude, and
  Codex users can reach the same docs-oriented tooling from this repo as well.

## Agent-specific Notes

- `.agents/AGENTS.md` is the canonical root guide.
- Root `AGENTS.md` is a symlink to `.agents/AGENTS.md`.
- Root `CLAUDE.md` is a compatibility symlink to `AGENTS.md`.
- Shared project instructions should stay tool-neutral and avoid depending on
  hidden chain-of-thought style prompting. State the goal, constraints, files,
  and verification steps directly.
- Shared agent/tool config lives in `.agents/config.json`; regenerate
  tool-specific shims with `pnpm install`, `pnpm run agents:sync`, or
  `node scripts/agents/sync-agent-shims.mjs`.
- Tool-specific config directories such as `.claude/`, `.codex/`, `.cursor/`,
  and `.vscode/` remain because the tools discover project settings from those
  fixed paths.
- Generated local artifacts include `.mcp.json`, `.cursor/mcp.json`,
  `.cursor/environment.json`, `.claude/settings.json`, `.claude/skills/*`,
  `.vscode/mcp.json`, `.codex/config.toml`, and
  `.codex/environments/environment.toml`.
- Preserve Cursor workflows by editing `.agents/config.json`, not the generated
  `.cursor/*` files directly.
- Shared agent setup overview: [`README.md`](README.md)
- Shared skill index: [`skills/README.md`](skills/README.md)
- This repo does not currently define shared skills beyond the index. Add them
  only when a repo-specific workflow becomes repeated enough to justify durable
  reusable guidance.

## Security and Configuration Tips

- Never commit secrets or credentials.
- Keep `.env.example` in sync with the env vars the repo expects.
- Treat generated provider config files as local artifacts, not tracked sources.
- If new local secret-bearing files are introduced, update shared agent config
  so generated tool settings can deny access to them by default instead of
  relying on prose instructions alone.

## Release Notes

- Release automation lives in `.github/workflows/release.yml`.
- Releases are intended to run from `main` only.
- The release workflow uses Node.js 24, `pnpm install --frozen-lockfile`,
  verifies build artifacts, and publishes with npm provenance via GitHub OIDC.
- Local fallback release commands are `pnpm release`, `pnpm release:alpha`,
  `pnpm release:beta`, and `pnpm release:rc`.

## Git Notes

- Do not use destructive git commands unless explicitly requested.
- Do not revert unrelated working-tree changes.
- Keep commits focused and atomic.

## Cursor Rules

- Any future `.cursor/rules/*.mdc` files should stay as thin wrappers around
  shared `AGENTS.md`, package docs, or shared skills rather than owning durable
  repo guidance directly.
