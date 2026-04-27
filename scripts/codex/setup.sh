#!/usr/bin/env bash

set -euo pipefail

ensure_env_file() {
  local target_path="$1"
  local fallback_path="$2"

  if [ -f "$target_path" ] || [ ! -f "$fallback_path" ]; then
    return 0
  fi

  cp "$fallback_path" "$target_path"
}

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Codex base environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@10.33.0 --activate

ensure_env_file .env .env.example

pnpm install --frozen-lockfile

# Build once during setup so dist-backed integration and e2e test aliases are ready.
pnpm build
