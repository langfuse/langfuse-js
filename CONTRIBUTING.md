# Contributing

## Development

This is a monorepo containing the Langfuse TypeScript/JavaScript SDK packages:

- **[@langfuse/core](./packages/core)** - Shared utilities, types and logger for Langfuse packages
- **[@langfuse/client](./packages/client)** - Langfuse API client for universal JavaScript environments
- **[@langfuse/tracing](./packages/tracing)** - Langfuse instrumentation methods based on OpenTelemetry
- **[@langfuse/otel](./packages/otel)** - Langfuse OpenTelemetry export helpers
- **[@langfuse/openai](./packages/openai)** - Langfuse integration for OpenAI SDK
- **[@langfuse/langchain](./packages/langchain)** - Langfuse integration for LangChain

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (package manager)

### Installing dependencies

```bash
pnpm install
```

### Shared Agent Setup

This repository keeps shared agent setup in source control so developers using
different tools work against the same instructions, bootstrap command, and MCP
server catalog.

- Canonical shared docs:
  - `.agents/AGENTS.md`
- Root discovery symlinks:
  - `AGENTS.md`
  - `CLAUDE.md`
- Shared agent setup overview: `.agents/README.md`
- Shared skills index: `.agents/skills/README.md`
- Shared tool/bootstrap/MCP config: `.agents/config.json`
- Tool-specific MCP configs generated locally from that catalog and not
  committed:
  - `.mcp.json`
  - `.cursor/mcp.json`
  - `.vscode/mcp.json`
  - `.codex/config.toml`
- Tool-specific runtime shims generated locally from the shared config and not
  committed:
  - `.claude/settings.json`
  - `.cursor/environment.json`
  - `.codex/environments/environment.toml`
- Tool-specific skill projections generated locally and not committed:
  - `.claude/skills/*`
- Shared bootstrap for agent environments: `bash scripts/codex/setup.sh`

Cursor compatibility is preserved through the generated `.cursor/mcp.json` and
`.cursor/environment.json` shims, so Cursor users keep the expected discovery
paths while `.agents/` remains the source of truth.

When you change the shared MCP or bootstrap setup:

1. Edit `.agents/config.json`
2. Run `pnpm run agents:sync`
3. Run `pnpm run agents:check`
4. Do not commit the generated MCP config files or runtime shims

### Building packages

```bash
# Build all packages
pnpm build

# Build and watch for changes
pnpm build --watch
```

## Testing

### Integration tests

Integration tests run fully locally using a `MockSpanExporter` to verify SDK behavior without requiring external services.

```bash
# Run integration tests
pnpm test:integration

# Run integration tests in watch mode
pnpm test:integration:watch
```

### End-to-end tests

End-to-end tests require a running Langfuse platform instance (dev server) to test the full integration flow.

**Setup**

1. Start local Langfuse server
2. Create testing project
3. Set environment variables: `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`

**Run**

```bash
# Run E2E tests
pnpm test:e2e
```

## Code Quality

```bash
# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Check formatting
pnpm format:check

# Type checking
pnpm typecheck

# Run all CI checks
pnpm ci
```

## Publishing

This project uses lockstep versioning - all packages are released together with the same version number. Releases are managed using [release-it](https://github.com/release-it/release-it) with conventional commits and automated changelog generation.

### Automated Releases via GitHub Actions (Recommended)

Releases are primarily handled through GitHub Actions with npm Trusted Publishing for secure, automated deployments.

**To create a new release:**

1. Navigate to **Actions** → **Release** workflow
2. Click **Run workflow**
3. Select the version bump type:
   - `patch` - Bug fixes (4.4.4 → 4.4.5)
   - `minor` - New features (4.4.4 → 4.5.0)
   - `major` - Breaking changes (4.4.4 → 5.0.0)
   - `prerelease` - Alpha/beta/rc versions
4. If prerelease, select type (`alpha`, `beta`, or `rc`)
5. (Optional) Check **Dry run** to test without publishing
6. Click **Run workflow**

The automated workflow will:

- Verify release is triggered from main branch
- Update versions in all package.json files across the monorepo
- Generate a changelog based on conventional commits
- Create a git commit and tag
- Build all packages
- Verify build artifacts and check for suspicious files
- Publish to npm with provenance attestations via Trusted Publishing
- Create a GitHub release with build artifacts
- Send Slack notifications (#releases for success, #team-engineering for failures)

**Security Features:**

- Branch verification (must run from main)
- Lockfile integrity checks
- Build artifact verification
- npm provenance attestations (cryptographic proof of origin)
- Concurrency control (one release at a time)
- Rollback detection and notification

**Prerequisites:**

- Write access to the repository
- npm Trusted Publishing configured for `@langfuse/*` packages

**Dry Run Mode:**

To test the release process without actually publishing:

- Check the "Dry run" option when triggering the workflow
- The workflow will perform all steps except npm publish and git push
- Useful for testing version bumps and verifying the release process

### Manual Local Releases (Fallback)

If GitHub Actions are unavailable, you can release locally:

```bash
# Production release
pnpm release

# Pre-release versions
pnpm release:alpha  # Alpha release
pnpm release:beta   # Beta release
pnpm release:rc     # Release candidate

# Dry run (preview changes without publishing)
pnpm release:dry
```

**Local release prerequisites:**

- npm authentication (`npm login`) with publish access
- Clean working directory
- On the main branch
- Upstream remote configured
- Git push access

**Note:** Local releases use the default `.release-it.json` configuration which includes npm publishing. For local testing without publishing, use the dry run command.

### Pre-release Versions

Pre-release versions (alpha, beta, rc):

- Are published with appropriate npm dist-tags
- Won't be installed by default with `npm install @langfuse/client`
- Must be explicitly installed: `npm install @langfuse/client@alpha`
- Are tagged in git for full traceability
- Generate pre-release entries in the changelog

### Provenance Attestations

All packages published via GitHub Actions include npm provenance attestations, providing cryptographic proof that packages were built from this repository. Users can verify package authenticity with:

```bash
npm view @langfuse/client --json | jq .dist.attestations
```

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Add tests for your changes
4. Run `pnpm ci` to ensure all checks pass
5. Create a pull request
