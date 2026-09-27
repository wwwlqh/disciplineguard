#!/usr/bin/env bash
# Syncs the client code people run on their computers to the public repo wwwlqh/disciplineguard-clients.
# Run at the end of each phase, after the review (PHASES.md "How the phases work").
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
SHA=$(git -C "$ROOT" rev-parse --short HEAD)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git clone -q https://github.com/wwwlqh/disciplineguard-clients.git "$TMP"
find "$TMP" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
# Only tracked files, from an allow-list. Never the server, web app, docs or spikes.
for p in packages/core/src packages/core/test clients/mt5/DG clients/mt5/DisciplineGuard.mq5 clients/mt5/tests/DG_CoreTests.mq5 \
         clients/windows/Cargo.toml clients/windows/Cargo.lock clients/windows/core clients/windows/app/src clients/windows/app/ui \
         clients/windows/app/icons clients/windows/app/capabilities clients/windows/app/nsis clients/windows/app/Cargo.toml \
         clients/windows/app/build.rs clients/windows/app/tauri.conf.json clients/windows/README.md \
         clients/extension/src clients/extension/static clients/extension/build.ts clients/extension/package.json clients/extension/README.md; do
  git -C "$ROOT" ls-files -z -- "$p" | while IFS= read -r -d '' f; do
    mkdir -p "$TMP/$(dirname "$f")"
    cp "$ROOT/$f" "$TMP/$f"
  done
done
cp "$ROOT/scripts/public/README.md" "$TMP/README.md"
cd "$TMP"
git add -A
if git diff --cached --quiet; then echo "Public repo already up to date."; exit 0; fi
git commit -q -m "Sync client source from $SHA"
git push -q origin HEAD:main
echo "Published $SHA to https://github.com/wwwlqh/disciplineguard-clients"
