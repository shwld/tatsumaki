#!/usr/bin/env bash
set -euo pipefail

should_run=0

for file_path in "$@"; do
  normalized="${file_path#./}"

  case "$normalized" in
    apps/web/src/domain/*.ts|apps/web/src/domain/*.tsx|apps/web/src/domain/**/*.ts|apps/web/src/domain/**/*.tsx)
      should_run=1
      break
      ;;
  esac
done

if [[ "$should_run" -eq 0 ]]; then
  echo "Skip lint:custom (no domain TS/TSX staged files)."
  exit 0
fi

echo "Run lint:custom (domain TS/TSX staged files detected)."
bun run lint:custom
