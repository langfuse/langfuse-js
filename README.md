# langfuse-js

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI test status](https://img.shields.io/github/actions/workflow/status/langfuse/langfuse-js/ci.yml?style=flat-square&label=All%20tests)](https://github.com/langfuse/langfuse-js/actions/workflows/ci.yml?query=branch%3Amain)
[![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse)
[![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU)
[![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

Modular mono repo for the Langfuse JS/TS client libraries.

## Packages

| Package                          | NPM                                                                                                                         | Environments          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [langfuse](./langfuse)           | [![npm package](https://img.shields.io/npm/v/langfuse?style=flat-square)](https://www.npmjs.com/package/langfuse)           | Node >= 18, Web, Edge |
| [langfuse-node](./langfuse-node) | [![npm package](https://img.shields.io/npm/v/langfuse-node?style=flat-square)](https://www.npmjs.com/package/langfuse-node) | Node < 18             |

## Documentation

[→ docs.langfuse.com](https://langfuse.com/docs/integrations/sdk/typescript)

## Development

This repository is broken into different packages

- **/langfuse-core** > All common code goes here.
- **/langfuse-node** > Node.js specific code
- **/langfuse** > Web/Edge/modern Node.js specific code, using fetch and browser APIs

### Installing dependencies

```sh
yarn
```

## Running tests

```sh
yarn test
```

### Integration test

**Setup**

1. Start local langfuse server
2. Create testing project
3. Set environment: LF_HOST, LF_PUBLIC_KEY, LF_SECRET_KEY

**Run**

```sh
# Build SDKs
yarn build

# Run E2E test
yarn test:integration
```

## Publishing a new version

Run `npx lerna publish --force-publish --no-private`

- Bumps version number of langfuse and langfuse-node, ignores langfuse-core
- Publishes to NPM, publishes also when there are no changes to keep the version numbers in sync
- Confirm with npmjs OTP

## License

[MIT](LICENSE)

## Credits

Thanks to the PostHog team for the awesome work on [posthog-js-lite](https://github.com/PostHog/posthog-js-lite). This project is based on it as it was the best starting point to build a modular SDK repo to support various environments.
