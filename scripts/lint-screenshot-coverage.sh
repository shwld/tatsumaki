#!/usr/bin/env bash
# Ensures every page route in App.tsx has a corresponding screenshot test.
# Extracts routes from the React Router <Route> definitions and checks
# that each route path appears in at least one page.goto() call in the
# screenshot test specs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_TSX="${REPO_ROOT}/apps/web/src/client/App.tsx"
SPEC_DIR="${REPO_ROOT}/apps/web/test/ui-screenshot"

rule_id="screenshot/all-pages-covered"
rule_description="Every page route must have a screenshot test."

# --- Extract route paths from App.tsx ---
# Collapse the file to handle multi-line <Route> elements, then extract
# paths that do NOT use Navigate (redirect).
route_paths=()

# Collapse file to single line, split on '<Route' to get each Route element
collapsed="$(tr '\n' ' ' < "$APP_TSX")"

# Extract each <Route ...> or <Route ... /> element
while [[ "$collapsed" =~ \<Route[[:space:]]+([^>]+)\> ]]; do
  route_attrs="${BASH_REMATCH[1]}"
  collapsed="${collapsed#*"${BASH_REMATCH[0]}"}"

  # Skip redirect routes (Navigate elements)
  [[ "$route_attrs" =~ Navigate ]] && continue

  # Extract path attribute
  if [[ "$route_attrs" =~ path=\"([^\"]+)\" ]]; then
    path="${BASH_REMATCH[1]}"
    # Skip catch-all and redirect patterns
    [[ "$path" == "*" ]] && continue
    [[ "$path" == "/" ]] && continue
    [[ "$path" =~ \*$ ]] && continue
    route_paths+=("$path")
  fi
done

if [[ ${#route_paths[@]} -eq 0 ]]; then
  echo "ERROR: [${rule_id}] No routes found in App.tsx" >&2
  exit 1
fi

# --- Collect all page.goto() paths from spec files ---
# Handles both single-line: page.goto("/path")
# and multi-line:  page.goto(\n    "/path",\n  )
goto_paths=""
for spec_file in "${SPEC_DIR}"/*.spec.ts; do
  [[ -f "$spec_file" ]] || continue
  # Collapse file into single line to handle multi-line goto calls,
  # then extract all goto path arguments.
  content="$(tr '\n' ' ' < "$spec_file")"
  # Match page.goto( "..." ) with optional whitespace
  while [[ "$content" =~ page\.goto\([[:space:]]*\"([^\"]+)\" ]]; do
    goto_paths+=$'\n'"${BASH_REMATCH[1]}"
    content="${content#*"${BASH_REMATCH[0]}"}"
  done
done

# --- Check each route has a matching goto ---
# Replace :param segments with a regex-friendly pattern for matching
violations=0
missing_routes=()

for route in "${route_paths[@]}"; do
  # Convert route params like :projectId to wildcard pattern for grep
  pattern="$(echo "$route" | sed 's/:[^/]*/.*/g')"

  if ! echo "$goto_paths" | grep -qE "$pattern"; then
    missing_routes+=("$route")
    violations=$((violations + 1))
  fi
done

if [[ $violations -gt 0 ]]; then
  echo "ERROR: [${rule_id}]"
  echo "WHY: ${rule_description}"
  echo ""
  echo "Missing screenshot tests for ${violations} route(s):"
  for route in "${missing_routes[@]}"; do
    echo "  - ${route}"
  done
  echo ""
  echo "FIX: Add a Playwright screenshot test with page.goto() for each missing route in ${SPEC_DIR}/"
  echo "EXAMPLE: See existing tests in ${SPEC_DIR}/stories.spec.ts"
  echo ""
  exit 1
fi

echo "Screenshot coverage lint passed: ${#route_paths[@]} routes checked, all covered."
exit 0
