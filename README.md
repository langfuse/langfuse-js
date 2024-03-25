# langfuse-js

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI test status](https://img.shields.io/github/actions/workflow/status/langfuse/langfuse-js/ci.yml?style=flat-square&label=All%20tests)](https://github.com/langfuse/langfuse-js/actions/workflows/ci.yml?query=branch%3Amain)
[![GitHub Repo stars](https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse)](https://github.com/langfuse/langfuse)
[![Discord](https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.gg/7NXusRtqYU)
[![YC W23](https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square)](https://www.ycombinator.com/companies/langfuse)

Modular mono repo for the Langfuse JS/TS client libraries.

## Packages

> [!IMPORTANT]
> The SDK was rewritten in v2 and released on December 18, 2023. Refer to the [v2 migration guide](https://langfuse.com/docs/sdk/typescript#upgrade1to2) for instructions on updating your code.

| Package                                    | NPM                                                                                                                                   | Environments          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [langfuse](./langfuse)                     | [![npm package](https://img.shields.io/npm/v/langfuse?style=flat-square)](https://www.npmjs.com/package/langfuse)                     | Node >= 18, Web, Edge |
| [langfuse-node](./langfuse-node)           | [![npm package](https://img.shields.io/npm/v/langfuse-node?style=flat-square)](https://www.npmjs.com/package/langfuse-node)           | Node < 18             |
| [langfuse-langchain](./langfuse-langchain) | [![npm package](https://img.shields.io/npm/v/langfuse-langchain?style=flat-square)](https://www.npmjs.com/package/langfuse-langchain) | Node >= 20, Web, Edge |

## Documentation

- Docs: https://langfuse.com/docs/sdk/typescript
- Reference: https://js.reference.langfuse.com

## License

[MIT](LICENSE)

## Credits

Thanks to the PostHog team for the awesome work on [posthog-js-lite](https://github.com/PostHog/posthog-js-lite). This project is based on it as it was the best starting point to build a modular SDK repo to support various environments.
