#!/usr/bin/env bash
set -euo pipefail

# Migration guard: block modifications to existing migration files.
# New migration files (git status A) are allowed.
# This script is called by lefthook with {staged_files} as arguments.

modified=()
for file_path in "$@"; do
  normalized="${file_path#./}"
  case "$normalized" in
    apps/web/migrations/*.sql)
      status=$(git diff --cached --name-status -- "$normalized" | awk '{print $1}')
      if [[ "$status" == "M" ]]; then
        modified+=("$normalized")
      fi
      ;;
  esac
done

if [[ ${#modified[@]} -gt 0 ]]; then
  echo ""
  echo "ERROR: Existing migration file(s) modified:"
  for f in "${modified[@]}"; do
    echo "  - $f"
  done
  echo ""
  echo "WHY: Migration files must never be modified after creation."
  echo "     They may have already been applied to production databases."
  echo "FIX: Revert the change and create a new migration file instead."
  echo "     Example: bun run wrangler -- d1 migrations create <db-name> <description>"
  exit 1
fi
