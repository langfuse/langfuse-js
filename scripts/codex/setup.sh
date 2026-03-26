#!/usr/bin/env bash

set -euo pipefail

ensure_env_file() {
  local target_path="$1"
  local fallback_path="$2"

  if [[ -f "$target_path" ]]; then
    return 0
  fi

  cp "$fallback_path" "$target_path"
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Node.js environment with Corepack support."
  exit 1
fi

corepack enable
corepack prepare pnpm@9.15.0 --activate

ensure_env_file .env .env.example

pnpm install --frozen-lockfile
