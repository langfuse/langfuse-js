# Changelog

## [4.0.0-beta.8](https://github.com/langfuse/langfuse-js/compare/v4.0.0-beta.7...v4.0.0-beta.8) (2025-08-26)

### ✨ Features

* **tracing:** add observation types ([#594](https://github.com/langfuse/langfuse-js/issues/594)) ([31586ff](https://github.com/langfuse/langfuse-js/commit/31586ff3c951aa42f100d1dc4ce51082cc3dc863))

## [4.0.0-beta.7](https://github.com/langfuse/langfuse-js/compare/v4.0.0-beta.6...v4.0.0-beta.7) (2025-08-25)

### ✨ Features

* **vercel-ai-sdk:** add media processing ([#593](https://github.com/langfuse/langfuse-js/issues/593)) ([7d3ee3a](https://github.com/langfuse/langfuse-js/commit/7d3ee3aaf028c3224e3750f8aa1a4da4b95c9cbd))

## [4.0.0-beta.6](https://github.com/langfuse/langfuse-js/compare/v4.0.0-beta.5...v4.0.0-beta.6) (2025-08-25)

### 🐛 Bug Fixes

* **processor:** move to crypto.subtle ([#592](https://github.com/langfuse/langfuse-js/issues/592)) ([f05a777](https://github.com/langfuse/langfuse-js/commit/f05a777e00c4c6a49b7b4f0bc9a7c658cc681445))
* **serializer:** do not serialize string primitives ([#591](https://github.com/langfuse/langfuse-js/issues/591)) ([df9b0b8](https://github.com/langfuse/langfuse-js/commit/df9b0b8d2e3acaa51af25b9fc5d3d3fcaac011ef))

## [4.0.0-beta.5](https://github.com/langfuse/langfuse-js/compare/v4.0.0-beta.4...v4.0.0-beta.5) (2025-08-20)

### ✨ Features

* **span-processor:** add export modes ([#590](https://github.com/langfuse/langfuse-js/issues/590)) ([d2f7386](https://github.com/langfuse/langfuse-js/commit/d2f73865fffd07d61bf697904e5945841b45693b))

## [4.0.0-beta.4](https://github.com/langfuse/langfuse-js/compare/v4.0.0-beta.3...v4.0.0-beta.4) (2025-08-20)

### ✨ Features

* **tracing:** add endOnExit option ([15568d9](https://github.com/langfuse/langfuse-js/commit/15568d99fa42277ebf870211c980326883f7c85a))

## [4.0.0-beta.3](https://github.com/langfuse/langfuse-js/compare/v4.0.0-beta.2...v4.0.0-beta.3) (2025-08-19)

### ✨ Features

* **tracing:** add getActiveSpanId ([63015d8](https://github.com/langfuse/langfuse-js/commit/63015d80b2e6c299476191ac3278278e7ed652db))
* **tracing:** add getActiveTraceID ([#589](https://github.com/langfuse/langfuse-js/issues/589)) ([ec8a54c](https://github.com/langfuse/langfuse-js/commit/ec8a54ca3dfad4fcdeb5f6d4fa705149432ac409))
* **tracing:** add parentSpanContext to observe wrapper ([1349804](https://github.com/langfuse/langfuse-js/commit/134980477d63edf8203ee0477f70449f8effc270))
* **tracing:** isolated tracer provider ([#588](https://github.com/langfuse/langfuse-js/issues/588)) ([5755686](https://github.com/langfuse/langfuse-js/commit/57556864e2aa9d2d902a7bd26f8b472c07dd661d))

### 🐛 Bug Fixes

* **observe:** preserve this context ([39f5c2d](https://github.com/langfuse/langfuse-js/commit/39f5c2d70a8f387b99bc1f9571a4e9235b89baba))

### 🔧 Maintenance

* auto access npm OTP ([2ba7da2](https://github.com/langfuse/langfuse-js/commit/2ba7da2c3baa981ac6674664acfd2526fabf3f98))
* bump vitest and remove outdated esbuild ([#587](https://github.com/langfuse/langfuse-js/issues/587)) ([4e320da](https://github.com/langfuse/langfuse-js/commit/4e320dac55ecccd2d7dfa9cc70a4beed4f57aa24))
* **deps-dev:** bump happy-dom from 14.12.3 to 15.10.2 ([#584](https://github.com/langfuse/langfuse-js/issues/584)) ([836ba31](https://github.com/langfuse/langfuse-js/commit/836ba317756595bc44f11a8da9a44a23889651b1))
* update eslint ([8459b4e](https://github.com/langfuse/langfuse-js/commit/8459b4ee775ce8edfeaafddb43dea72503a0753a))
* update release it Github release flow ([7f26462](https://github.com/langfuse/langfuse-js/commit/7f26462b8c63556e3f9b91858cb674b6a296ac2a))

### 📚 Documentation

* update contributing.md ([d54ba62](https://github.com/langfuse/langfuse-js/commit/d54ba628956c01387ed51cbad15a957167821ab7))

## [4.0.0-beta.2](https://github.com/langfuse/langfuse-js/compare/v4.0.0-beta.1...v4.0.0-beta.2) (2025-08-08)

### 🐛 Bug Fixes

* **span-processor:** drop dep on Buffer ([28c9985](https://github.com/langfuse/langfuse-js/commit/28c9985781efda45586d0c8c17b0154c56765b43))

### 📚 Documentation

* add jsdoc for client and otel package ([16c6366](https://github.com/langfuse/langfuse-js/commit/16c6366cece574fd5ba33121467f32df06fdac0d))
* add jsdoc for openai and tracing package ([e2182ec](https://github.com/langfuse/langfuse-js/commit/e2182ece84feae754d0827d06ffdeec2d9361ae0))

## [4.0.0-beta.1](https://github.com/langfuse/langfuse-js/compare/v4.0.0-beta.0...v4.0.0-beta.1) (2025-08-07)

### 🔧 Maintenance

* add Github release to release-it ([184cd81](https://github.com/langfuse/langfuse-js/commit/184cd819a667d594bc5fb955e453031a032b3daf))
* add package readmes ([031760c](https://github.com/langfuse/langfuse-js/commit/031760c925302581441ff62b50ecf8d465b39426))

## [4.0.0-beta.0](https://github.com/langfuse/langfuse-js/compare/v4.0.0-alpha.3...v4.0.0-beta.0) (2025-08-07)

### 🔧 Maintenance

* **client:** make params optional ([d55ab80](https://github.com/langfuse/langfuse-js/commit/d55ab8012ee7b7ed37eb27b1d925e8fea0e78e8b))
* **otel:** export types ([1febde7](https://github.com/langfuse/langfuse-js/commit/1febde7380276225b2622cbd3b6b6594c4b69868))

## [4.0.0-alpha.3](https://github.com/langfuse/langfuse-js/compare/v4.0.0-alpha.2...v4.0.0-alpha.3) (2025-08-07)

### 🔧 Maintenance

* remove build files from typecheck ([d7498a6](https://github.com/langfuse/langfuse-js/commit/d7498a62020f6232c016237dd4bd15f7b1ac19e5))

## [4.0.0-alpha.2](https://github.com/langfuse/langfuse-js/compare/v4.0.0-alpha.1...v4.0.0-alpha.2) (2025-08-07)

### 🔧 Maintenance

* remove prepublish hook ([324cb8f](https://github.com/langfuse/langfuse-js/commit/324cb8f936bef1ce915b015469003fa653ca64f5))

## [4.0.0-alpha.1](https://github.com/langfuse/langfuse-js/compare/v4.0.0-alpha.0...v4.0.0-alpha.1) (2025-08-07)

## [4.0.0-alpha.0](https://github.com/langfuse/langfuse-js/compare/v3.38.4...v4.0.0-alpha.0) (2025-08-07)

### ✨ Features

* upgrade to v4 ([#583](https://github.com/langfuse/langfuse-js/issues/583)) ([e311b18](https://github.com/langfuse/langfuse-js/commit/e311b184a10f502b315c34309ab70edea0caa2dd))

### 🔧 Maintenance

* add claude.md file ([#579](https://github.com/langfuse/langfuse-js/issues/579)) ([945d891](https://github.com/langfuse/langfuse-js/commit/945d891c776cfbe7355d5a2d82fbd86662dce1eb))
* bump version ([09bff17](https://github.com/langfuse/langfuse-js/commit/09bff17bc6cdba90aa6a532b4718b34eb627fe84))
* **deps:** bump form-data from 4.0.2 to 4.0.4 ([#577](https://github.com/langfuse/langfuse-js/issues/577)) ([ecb4a6e](https://github.com/langfuse/langfuse-js/commit/ecb4a6e5db0f484f32ba809d5eabafe7f611fb1c))
* reduce claude permissions ([#582](https://github.com/langfuse/langfuse-js/issues/582)) ([4294460](https://github.com/langfuse/langfuse-js/commit/4294460eb8a15076b89a1f79215b209610e8131c))
