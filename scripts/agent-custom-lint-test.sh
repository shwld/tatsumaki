#!/usr/bin/env bash
# Smoke test for agent-custom-lint.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LINTER="${REPO_ROOT}/scripts/agent-custom-lint.sh"

valid_dir="${REPO_ROOT}/docs/lint-fixtures/domain-valid"
invalid_dir="${REPO_ROOT}/docs/lint-fixtures/domain-invalid"

echo "Running valid fixture check..."
bash "$LINTER" --path "$valid_dir"

echo "Running invalid fixture check..."
set +e
invalid_output="$(bash "$LINTER" --path "$invalid_dir" 2>&1)"
invalid_status=$?
set -e

if [[ "$invalid_status" -eq 0 ]]; then
  echo "Expected invalid fixture to fail, but it passed." >&2
  exit 1
fi

for token in "ERROR: [boundary/no-domain-import-from-outer-layers]" "WHY:" "FIX:" "EXAMPLE:" "REFERENCE:"; do
  if ! printf '%s\n' "$invalid_output" | grep -Fq "$token"; then
    echo "Expected invalid output to contain '$token'" >&2
    exit 1
  fi
done

echo "Agent custom lint fixture checks passed."
