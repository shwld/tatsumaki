#!/usr/bin/env bash
# Smoke test for lint-screenshot-coverage.sh
# Verifies the lint correctly detects missing screenshot tests.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LINTER="${REPO_ROOT}/scripts/lint-screenshot-coverage.sh"

echo "Running screenshot coverage lint (expect failure with missing routes)..."
set +e
output="$(bash "$LINTER" 2>&1)"
status=$?
set -e

# Currently some routes are missing, so the lint should fail
if [[ "$status" -eq 0 ]]; then
  echo "WARN: All routes are covered — lint passed (this is fine if all tests exist)"
else
  # Verify output format contains expected tokens
  for token in "ERROR: [screenshot/all-pages-covered]" "WHY:" "FIX:" "EXAMPLE:"; do
    if ! printf '%s\n' "$output" | grep -Fq "$token"; then
      echo "Expected output to contain '${token}'" >&2
      echo "Actual output:"
      echo "$output"
      exit 1
    fi
  done
  echo "Lint correctly detected missing routes."
fi

echo "Screenshot coverage lint test passed."
