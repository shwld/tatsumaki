#!/usr/bin/env bash
# Completion Gate — pre-push quality checks
# Runs lint, openapi-check, test, typecheck in sequence. Exits non-zero on first failure.
# Output format on failure:
#   [GATE FAILED] <command>
#   Reason: <full command output>
#   Next:   Fix the reported issues, then retry.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run_check() {
  local label="$1"
  shift
  local cmd=("$@")

  echo "── $label ──"
  if output=$("${cmd[@]}" 2>&1); then
    echo "✓ $label passed"
    return 0
  else
    local rc=$?
    echo ""
    echo "[GATE FAILED] $label"
    echo "Command: ${cmd[*]}"
    echo "Reason:"
    echo "$output"
    echo ""
    echo "Next: Fix the reported $label issues above, then retry."
    return $rc
  fi
}

cd "$REPO_ROOT"

# 0. Skill link consistency — prevent missing .agents/skills links
run_check "skill-link-check" bash scripts/check-skill-links.sh

# 1. Lint — fast static analysis
run_check "lint" bun run lint

# 2. OpenAPI contract drift check (CLI)
run_check "openapi-check" bun run openapi:check

# 3. Test — unit / integration tests
run_check "test" bun run test

# 4. Typecheck — type safety
run_check "typecheck" bun run typecheck

echo ""
echo "✓ All pre-push quality checks passed."
