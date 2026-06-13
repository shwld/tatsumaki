#!/usr/bin/env bash
# Agent custom linter for project-specific anti-patterns.
# Rule set v1 focuses on architecture boundary violations.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_TARGET="apps/web/src/domain"

target="${DEFAULT_TARGET}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --path)
      shift
      target="${1:-}"
      ;;
    --help|-h)
      echo "Usage: bash scripts/agent-custom-lint.sh [--path <relative-or-absolute-dir>]"
      echo "Default path: ${DEFAULT_TARGET}"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -z "$target" ]]; then
  echo "Target path is required." >&2
  exit 2
fi

if [[ "$target" = /* ]]; then
  scan_root="$target"
else
  scan_root="${REPO_ROOT}/${target}"
fi

if [[ ! -d "$scan_root" ]]; then
  echo "Target directory not found: $target" >&2
  exit 2
fi

rule_id="boundary/no-domain-import-from-outer-layers"
rule_description="Domain layer must not import application/presentation/infrastructure/client modules."
rule_reference="docs/agent-custom-linter-strategy.md"

violations=0
checked_files=0

while IFS= read -r file; do
  checked_files=$((checked_files + 1))
  line_no=0
  while IFS= read -r line; do
    line_no=$((line_no + 1))
    [[ "$line" =~ ^[[:space:]]*import[[:space:]] ]] || continue

    # Extract the import source from "from 'x'" or "import('x')".
    source=""
    if [[ "$line" =~ from[[:space:]]*[\"\']([^\"\']+)[\"\'] ]]; then
      source="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ import[[:space:]]*\([[:space:]]*[\"\']([^\"\']+)[\"\'] ]]; then
      source="${BASH_REMATCH[1]}"
    else
      continue
    fi

    if [[ "$source" =~ (^|/)(application|presentation|infrastructure|client)(/|$) ]]; then
      rel_file="${file#${REPO_ROOT}/}"
      echo "ERROR: [${rule_id}]"
      echo "WHY: ${rel_file}:${line_no} imports '${source}'. ${rule_description}"
      echo "FIX: Keep domain imports inside the domain layer. Move this dependency behind an interface or relocate the logic to the outer layer."
      echo "EXAMPLE: Replace import '${source}' with a domain-local module or injected port."
      echo "REFERENCE: ${rule_reference}"
      echo ""
      violations=$((violations + 1))
    fi
  done <"$file"
done < <(find "$scan_root" -type f \( -name "*.ts" -o -name "*.tsx" \) | sort)

if [[ $violations -gt 0 ]]; then
  echo "Violations: ${violations}"
  exit 1
fi

co_location_rule_id="i18n/no-centralized-locale-definitions"
co_location_rule_description="Locale definitions must be co-located with components/screens, not centralized under src/client/i18n."
co_location_rule_reference="docs/guidelines/i18n-translation-rules.md"

central_i18n_root="${REPO_ROOT}/apps/web/src/client/i18n"
if [[ -d "$central_i18n_root" ]]; then
  while IFS= read -r file; do
    rel_file="${file#${REPO_ROOT}/}"
    base="$(basename "$file")"
    if [[ "$base" == "config.ts" ]]; then
      continue
    fi

    echo "ERROR: [${co_location_rule_id}]"
    echo "WHY: ${rel_file} is a centralized locale definition. ${co_location_rule_description}"
    echo "FIX: Move locale dictionaries next to the component/screen (for example: src/client/components/<name>.i18n.ts)."
    echo "EXAMPLE: Move '${rel_file}' -> 'apps/web/src/client/components/layout.i18n.ts'."
    echo "REFERENCE: ${co_location_rule_reference}"
    echo ""
    violations=$((violations + 1))
  done < <(find "$central_i18n_root" -type f \( -name "*.json" -o -name "*.ja.ts" -o -name "*.en.ts" -o -name "*.i18n.ts" \) | sort)
fi

if [[ $violations -gt 0 ]]; then
  echo "Violations: ${violations}"
  exit 1
fi

echo "Agent custom lint passed: ${checked_files} files checked, 0 violations."
exit 0
