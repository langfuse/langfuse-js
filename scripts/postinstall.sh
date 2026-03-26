#!/usr/bin/env bash

set -euo pipefail

# Docker builds or partial install contexts may run root postinstall without the
# full source tree. In that case, shared agent files are intentionally absent
# and syncing local tool shims is not needed.
if [[ ! -f "scripts/agents/sync-agent-shims.mjs" ]]; then
  echo "Skipping agent shim sync: scripts/agents/sync-agent-shims.mjs is not present in this install context."
  exit 0
fi

pnpm run agents:sync
pnpm run agents:check
