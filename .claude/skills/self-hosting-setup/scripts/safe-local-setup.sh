#!/usr/bin/env bash

set -euo pipefail

show_help() {
  cat <<'USAGE'
Usage: bash .claude/skills/self-hosting-setup/scripts/safe-local-setup.sh [--seed-scroll]

Safe local setup for tatsumaki:
  - verify repo root
  - verify bun is installed
  - install dependencies with the lockfile frozen
  - sync agent skill links
  - apply local D1 migrations
  - optionally seed local scroll verification data

This script does not start the dev server and does not perform remote Cloudflare changes.
USAGE
}

seed_scroll=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed-scroll)
      seed_scroll=1
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      show_help >&2
      exit 1
      ;;
  esac
done

if [[ ! -f package.json || ! -f apps/web/package.json || ! -f apps/web/wrangler.dev.toml ]]; then
  echo "Run this script from the tatsumaki repository root." >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required. Install Bun first: https://bun.sh/docs/installation" >&2
  exit 1
fi

echo "==> Installing dependencies with frozen lockfile"
bun install --frozen-lockfile

echo "==> Syncing agent skill links"
bash scripts/sync-agent-skill-links.sh

echo "==> Applying local D1 migrations"
(
  cd apps/web
  bun run db:migrate:local
)

if [[ "$seed_scroll" == "1" ]]; then
  echo "==> Seeding local scroll verification data"
  bun run seed:scroll
fi

cat <<'NEXT'

Safe local setup complete.

Next command:
  bun run dev

Then open:
  http://localhost:8787
NEXT

