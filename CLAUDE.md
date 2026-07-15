# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modular monorepo for Langfuse JS/TS client libraries, an observability and analytics platform for LLM applications. The codebase supports multiple environments: Node >= 18, Web, and Cloudflare Edge runtimes.

## Development Commands

### Building and Compilation
- `yarn build` or `yarn compile` - Builds all packages using Rollup
- `yarn clean:build` - Clean build (removes node_modules, reinstalls, builds)

### Testing
- `yarn test` - Run tests for core, node, and main packages, same as :all
- `yarn test:core` - Test langfuse-core only
- `yarn test:node` - Test langfuse-node only
- `yarn test:fetch` - Test langfuse package only
- `yarn test:integration` - Run integration tests
- `yarn test:langchain` - Test Langchain integration
- Individual package tests: `yarn test:datasets`, `yarn test:node-integration`, etc.

### Code Quality
- `yarn lint` - ESLint with auto-fix
- `yarn prettier` - Format code with Prettier
- `yarn prettier:check` - Check Prettier formatting

### API Generation
- `yarn generateAPI` - Generate both API types and client
- `yarn generateAPITypes` - Generate TypeScript types from OpenAPI specs
- `yarn generateAPIClient` - Generate API client code

### Documentation
- `yarn docs` - Generate TypeDoc documentation

## Architecture

### Package Structure

- **langfuse-core**: Core functionality shared across all packages, including prompt clients, types, and utilities
- **langfuse**: Main package for Node >= 18, Web, and Edge environments
- **langfuse-node**: Legacy Node < 18 support
- **langfuse-langchain**: LangChain integration
- **langfuse-vercel**: Vercel-specific utilities (beta)

### Core Design
The SDK follows a modular architecture with shared core functionality:

1. **LangfuseCoreStateless** (`langfuse-core/src/index.ts:184`) - Abstract base class providing:
   - Event queuing and batching
   - Network retry logic with exponential backoff
   - Media handling (file uploads to S3/Azure)
   - Sampling and masking
   - Environment detection and validation

2. **LangfuseCore** (`langfuse-core/src/index.ts:1352`) - Extends core with:
   - Prompt caching system
   - Client objects for traces, spans, generations, events
   - Dataset management
   - Media reference resolution

3. **Environment-specific implementations** extend the core:
   - `langfuse`: Web/Node.js implementation with fetch API
   - `langfuse-node`: Node.js with axios for older Node versions
   - `langfuse-langchain`: Langchain callback integration

### Key Components

- **Event Processing**: All SDK actions are queued as events and batched for efficient API calls
- **Media Handling**: Automatic detection and upload of base64 data URIs and media objects
- **Prompt Management**: Caching system with TTL and background refresh for prompt templates
- **Observability Objects**: Hierarchical trace → span/generation → event structure
- **Type Safety**: Full TypeScript support with generated API types from OpenAPI specs

### Build System
- **Rollup** for bundling with dual ESM/CJS output
- **TypeScript** compilation with source maps
- **Babel** for browser compatibility
- **Jest** for testing with ts-jest transform
- **TypeDoc** for documentation generation

## Testing Strategy

Tests are organized by package and functionality:
- Unit tests in each package's `test/` directory
- Integration tests in `integration-test/` directory
- Example applications in `examples/` for manual testing
- Tests use Jest with fake timers and DOM environment for compatibility

## Key Files and Patterns

- **Rollup config** (`rollup.config.js`) handles multi-package builds
- **Package workspaces** defined in root `package.json`
- **OpenAPI specs** in `langfuse-core/openapi-spec/` drive type generation
- **TypeScript configs** use extends pattern for consistency
- **Event masking** and **truncation** for privacy/size limits
- **Retry logic** with configurable backoff for network resilience

## Environment Configuration

The SDK supports multiple deployment environments through environment variables:
- `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` for authentication
- `LANGFUSE_BASEURL` for custom endpoints
- `LANGFUSE_SAMPLE_RATE` for trace sampling
- `LANGFUSE_TRACING_ENVIRONMENT` for environment tagging

### Development Notes

- The codebase uses Mustache templating with escaping disabled (`mustache.escape = function(text) { return text; }`)
- Cross-package imports should reference the workspace packages, not built versions during development
- API client generation uses `swagger-typescript-api` for the server spec and `openapi-typescript` for type generation
- Test files use the pattern `*.spec.ts` and are excluded from builds via `testPathIgnorePatterns`
