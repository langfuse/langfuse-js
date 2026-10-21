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

- Node.js 22+ for SDK runtime compatibility (22.13+ for repository development);
  Node.js 24 is recommended for development and Codex/CI parity
- pnpm 10.33.0 via Corepack

### Installing dependencies

```bash
pnpm install
```

## Developing with Codex and coding agents

This repository includes [AGENTS.md](./AGENTS.md) as the durable project guide
for Codex and other coding agents. Update it in the same pull request whenever
the repo's architecture, package boundaries, mandatory checks, release process,
or durable coding conventions change.

For Codex cloud environments:

1. Create a new environment for this repository in the Codex UI.
2. Choose a base environment with Node.js 24 support.
3. Set the setup script to:

   ```bash
   bash scripts/codex/setup.sh
   ```

4. Set the maintenance script to:

   ```bash
   bash scripts/codex/maintenance.sh
   ```

5. Keep agent internet access disabled by default, or allow only the minimum
   domains required for a task.
6. Add secrets such as `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, and
   `LANGFUSE_SECRET_KEY` in the Codex UI instead of committing them.

The Codex setup installs dependencies with the pinned pnpm version and builds
the packages once so dist-backed integration and e2e tests are ready. It does
not start a Langfuse server; e2e tests still require a reachable server and the
environment variables documented below.

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

This project uses lockstep versioning - all packages are released together with the same version number. Releases are managed using [release-it](https://github.com/release-it/release-it) with conventional commits; release notes are generated automatically on the GitHub release.

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
- Create a git commit and tag
- Build all packages
- Verify build artifacts and check for suspicious files
- Create a GitHub release with build artifacts
- Stage every package on npm with provenance attestations via Trusted Publishing (`scripts/stage-publish.sh`)
- Send Slack notifications (#releases for success, #team-engineering for failures)

**Approving the staged release (required):**

Staged versions are not installable until an npm maintainer approves them with
2FA. The workflow run summary lists each stage id in dependency order; approve
in that order (`@langfuse/core` first) so dependents never resolve to a missing
version:

```bash
npm stage list                  # pending stage ids
npm stage download <stage-id>   # optional: inspect the exact tarball
npm stage approve <stage-id>    # prompts for 2FA
```

Approval can also be done on npmjs.com. If a staged release looks wrong, run
`npm stage reject <stage-id>` for every package of that version.

**Security Features:**

- Branch verification (must run from main)
- Lockfile integrity checks
- Build artifact verification
- npm provenance attestations (cryptographic proof of origin)
- npm staged publishing: CI can only stage; a human approves with npm 2FA, so stolen GitHub credentials alone cannot ship a release
- Concurrency control (one release at a time)
- Rollback detection and notification

**Prerequisites:**

- Write access to the repository
- npm Trusted Publishing configured for `@langfuse/*` packages, with stage publish allowed and direct publish disallowed on the trust relationship (`npm trust github <package> --file release.yml --repo langfuse/langfuse-js --env "protected branches" --allow-stage-publish`, without `--allow-publish`)
- Package publishing access on npm set to "Require two-factor authentication and disallow tokens"

**Dry Run Mode:**

To test the release process without actually publishing:

- Check the "Dry run" option when triggering the workflow
- The workflow will perform all steps except npm staging and git push
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
- Get their own GitHub release with auto-generated release notes

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
5. Create a pull request with a Conventional Commits title and list the
   verification commands you ran

## Commit messages and PR titles

Commit messages and PR titles must follow
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
type(scope): description
type: description
```

Allowed common types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
`test`, `build`, `ci`, `chore`, `revert`, and `security`. Scopes are optional,
but useful when a change is limited to a package such as `openai`, `tracing`, or
`client`.
