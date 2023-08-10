# langfuse-js-mono

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)

Modular mono repo for the Langfuse JS/TS client libraries.

## Packages

| Package                          | NPM                                                                                                                         | Environments          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [langfuse](./langfuse)           | [![npm package](https://img.shields.io/npm/v/langfuse?style=flat-square)](https://www.npmjs.com/package/langfuse)           | Node >= 18, Web, Edge |
| [langfuse-node](./langfuse-node) | [![npm package](https://img.shields.io/npm/v/langfuse-node?style=flat-square)](https://www.npmjs.com/package/langfuse-node) | Node < 18             |

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

1. Go to the appropriate `package.json` file. For example, for `langfuse-node`, this is `langfuse-node/package.json`.
2. Bump the version number in the file.
3. Add to `CHANGELOG.md` the relevant changes.
4. On merge, a new version is published automatically thanks to the CI pipeline.

## License

[MIT](LICENSE)

## Credits

Thanks to the PostHog team for the awesome work on [posthog-js-lite](https://github.com/PostHog/posthog-js-lite). This project is based on it as it was the best starting point to build a modular SDK repo to support various environments.
