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
3. Set environment variables: `LANGFUSE_BASEURL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`

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

### Production Releases

```bash
# Create and publish a new release
pnpm release
```

The release process is fully automated and will:

- Prompt for the version bump type (patch, minor, major)
- Generate a changelog based on conventional commits
- Update all package.json files in the monorepo to maintain version consistency
- Create a git commit with the version bump
- Create and push a git tag
- Build all packages
- Publish to npm with the `latest` dist-tag

### Pre-release Versions

For testing unreleased features:

```bash
# Create alpha pre-release
pnpm release:alpha

# Create beta pre-release
pnpm release:beta

# Create release candidate
pnpm release:rc
```

Pre-release versions:

- Are published with appropriate npm dist-tags (`alpha`, `beta`, `rc`)
- Won't be installed by default with `npm install @langfuse/client`
- Must be explicitly installed: `npm install @langfuse/client@alpha`
- Are tagged in git for full traceability
- Generate pre-release entries in the changelog

### NPM Two-Factor Authentication (2FA/OTP)

If your npm account has two-factor authentication enabled (recommended), you **must** provide an OTP via environment variable:

```bash
# Provide OTP via environment variable (required for 2FA accounts)
otp=123456 pnpm release

# For pre-releases
otp=123456 pnpm release:alpha
otp=123456 pnpm release:beta
otp=123456 pnpm release:rc
```

**Important**: The OTP cannot be provided interactively during the release process - it must be set as an environment variable before running the release command.

### Release Prerequisites

Before running any release command:

- **NPM Authentication**: You must be logged into npm (`npm login`) with publish access
- **Two-Factor Authentication**: If 2FA is enabled, you must provide `otp=123456` before the command
- **Clean Repository**: No uncommitted or staged changes
- **Main Branch**: Must be on the main branch
- **Upstream Remote**: Must have an upstream remote configured
- **Git Authentication**: Must be able to push tags to the repository

The release-it configuration enforces these requirements automatically.

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Add tests for your changes
4. Run `pnpm ci` to ensure all checks pass
5. Create a pull request
