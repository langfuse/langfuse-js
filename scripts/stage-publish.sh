#!/usr/bin/env bash
# Stages every package under packages/ on npm via trusted publishing.
#
# Staged versions are not installable until a maintainer approves them on
# npmjs.com (or with `npm stage approve <id>`) using npm 2FA. A CI run, or a
# GitHub account that can trigger one, can therefore never put a version in
# front of users on its own.
set -euo pipefail

: "${NPM_CONFIG_TAG:?NPM_CONFIG_TAG must be set to the npm dist-tag}"

pack_dir="$(mktemp -d)"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

# pnpm pack rewrites workspace:^ ranges to concrete versions; npm cannot.
# The JSON lists tarballs in dependency order, which is also the order in
# which staged versions should be approved.
pnpm --recursive --filter "./packages/**" pack \
  --pack-destination "$pack_dir" --json > "$pack_dir/packed.json"
mapfile -t tarballs < <(jq -r '.[].filename' "$pack_dir/packed.json")

if [ "${#tarballs[@]}" -eq 0 ]; then
  echo "::error::No package tarballs were produced"
  exit 1
fi

{
  echo "### npm packages staged, approval required"
  echo ""
  echo "Nothing is installable yet. Approve each version on npmjs.com, or run"
  echo "\`npm stage approve <id>\`, in the order listed (dependencies first)."
  echo ""
} >> "$summary"

for tarball in "${tarballs[@]}"; do
  result="$(npm stage publish "$tarball" \
    --provenance \
    --access public \
    --tag "$NPM_CONFIG_TAG" \
    --ignore-scripts)"
  echo "$result"
  grep '^+ ' <<< "$result" | sed 's/^+ /- /' >> "$summary"
done
