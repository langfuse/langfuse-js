#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT

repo_copy="$tmpdir/repo"
corepack_log="$tmpdir/corepack.log"
pnpm_log="$tmpdir/pnpm.log"
expected_pnpm_version="$(node -e 'const fs = require("node:fs"); const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const packageManager = pkg.packageManager ?? ""; if (!packageManager.startsWith("pnpm@")) process.exit(1); process.stdout.write(packageManager.slice("pnpm@".length).split("+")[0]);' "$repo_root/package.json")"

mkdir -p "$tmpdir/bin" "$repo_copy/scripts/codex"

cp "$repo_root/scripts/codex/setup.sh" "$repo_copy/scripts/codex/setup.sh"
cp "$repo_root/.env.example" "$repo_copy/.env.example"
cp "$repo_root/package.json" "$repo_copy/package.json"

chmod +x "$repo_copy/scripts/codex/setup.sh"

cat <<EOF > "$tmpdir/bin/corepack"
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$corepack_log"
exit 0
EOF

cat <<EOF > "$tmpdir/bin/pnpm"
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$pnpm_log"
exit 0
EOF

chmod +x "$tmpdir/bin/corepack" "$tmpdir/bin/pnpm"

assert_file_contains() {
  local file_path="$1"
  local expected="$2"
  local message="$3"

  if ! grep -Fqx -- "$expected" "$file_path"; then
    echo "$message"
    echo "missing line: $expected"
    exit 1
  fi
}

run_setup() {
  (
    cd "$repo_copy"
    PATH="$tmpdir/bin:$PATH" bash scripts/codex/setup.sh
  )
}

run_setup

if ! cmp -s "$repo_copy/.env.example" "$repo_copy/.env"; then
  echo ".env should be created from .env.example when missing"
  exit 1
fi

cat <<'EOF' > "$repo_copy/.env"
WORKTREE_ONLY=keep-me
EOF

run_setup

assert_file_contains \
  "$repo_copy/.env" \
  "WORKTREE_ONLY=keep-me" \
  "setup.sh should not overwrite an existing .env"

assert_file_contains \
  "$pnpm_log" \
  "install --frozen-lockfile" \
  "setup.sh should install workspace dependencies with the frozen lockfile"

assert_file_contains \
  "$corepack_log" \
  "prepare pnpm@${expected_pnpm_version} --activate" \
  "setup.sh should prepare the pnpm version pinned in package.json"

echo "setup.sh example bootstrap regression test passed"
