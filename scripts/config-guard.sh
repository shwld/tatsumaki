#!/usr/bin/env bash
# Config guard — blocks unsafe edits and destructive operations.
# Used by lefthook pre-commit / pre-push to reduce accidental risk.
#
# Exit codes:
#   0 – allow
#   2 – block
#
# Override: set CONFIG_GUARD_ALLOW=1 to bypass (for approved changes only).

set -euo pipefail

REPO_ROOT="${CONFIG_GUARD_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# --- Guard policy ------------------------------------------------------------
# Quality-gate settings (existing policy).
PROTECTED_CONFIG_PATTERNS=(
  '.oxlintrc.json'        # oxlint rules
  'biome.json'            # biome formatter/linter config
  'lefthook.yml'          # git hooks
  '.claude/settings.json' # Claude Code settings
)

# Exact-match patterns (path relative to repo root after stripping prefix).
PROTECTED_CONFIG_EXACT=(
  'package.json'              # root: lint/test/typecheck エントリ
  'apps/web/package.json'     # web: dev/test スクリプト（Vitest 等）
)

# Secrets / credential-like files.
SENSITIVE_FILE_PATTERNS=(
  '.env'
  '.env.'
  '.envrc'
  '.npmrc'
  '.pypirc'
  '.netrc'
  '.aws/credentials'
  '.aws/config'
  '.ssh/config'
  '.ssh/id_'
  '.docker/config.json'
  '.kube/config'
  '.gnupg/'
  '.pem'
  '.key'
  '.p12'
  '.pfx'
  '.crt'
)

SENSITIVE_FILE_REGEX=(
  '(^|/)\.env(\.[^/]+)?$'
  '(^|/).*secret(s)?([._-].*)?$'
  '(^|/).*credential(s)?([._-].*)?$'
  '(^|/).*token(s)?([._-].*)?$'
)

# High-risk commands / SQL operations that can delete or destroy data.
DESTRUCTIVE_OPERATION_PATTERNS=(
  'rm[[:space:]]+-rf?[[:space:]]+(/|~|\\$HOME|\\*|\\./\\*|\\.\\./|\\.)'
  'git[[:space:]]+clean[[:space:]]+-fdx([[:space:]]|$)'
  'find[[:space:]].*-delete([[:space:]]|$)'
  'mkfs\\.[[:alnum:]_]+'
  'dd[[:space:]].*of=/dev/'
  ':[[:space:]]*>[[:space:]]*[^[:space:]]+'
  'DROP[[:space:]]+DATABASE([[:space:]]|;|$)'
  'DROP[[:space:]]+SCHEMA([[:space:]]|;|$)'
  'TRUNCATE[[:space:]]+TABLE([[:space:]]|;|$)'
  'DELETE[[:space:]]+FROM[[:space:]]+[[:alnum:]_."]+[[:space:]]*;'
)

# --- Override check ----------------------------------------------------------
if [[ "${CONFIG_GUARD_ALLOW:-0}" == "1" ]]; then
  exit 0
fi

CONFIG_GUARD_MODE="${CONFIG_GUARD_MODE:-auto}"

# --- Resolve target files ----------------------------------------------------
# Supported modes:
# 1. Explicit file paths via script args
# 2. Piped input: JSON with "file_path" field
# 3. Git hook fallback: staged files from index
collect_target_files() {
  if [[ "$#" -gt 0 ]]; then
    printf "%s\n" "$@"
    return 0
  fi

  local input="" file_path="" staged
  # Read stdin only when data is available (piped, not a terminal).
  # Without this guard, `cat` blocks indefinitely when lefthook invokes the
  # script without stdin redirection.
  if [[ ! -t 0 ]]; then
    input="$(cat || true)"
    file_path="$(printf '%s' "$input" | grep -o '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"$//')"
  fi
  if [[ -n "$file_path" ]]; then
    printf "%s\n" "$file_path"
    return 0
  fi

  staged="$(git -C "$REPO_ROOT" diff --cached --name-only -- 2>/dev/null || true)"
  if [[ -n "$staged" ]]; then
    printf "%s\n" "$staged"
  fi
}

block_violation() {
  local title="$1" file="$2" rule="$3" reason="$4" next="$5"
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  [CONFIG GUARD] Blocked by safety policy                   ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║                                                            ║"
  echo "║  Type:   $title"
  echo "║  File:   $file"
  echo "║  Rule:   $rule"
  echo "║                                                            ║"
  echo "║  Reason: $reason"
  echo "║                                                            ║"
  echo "║  Next:   $next"
  echo "║                                                            ║"
  echo "║  See: docs/config-guard.md                                 ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  exit 2
}

is_sensitive_file() {
  local file="$1"
  local normalized="$file"
  normalized="${normalized#./}"
  normalized="${normalized#"$REPO_ROOT"/}"

  for pattern in "${SENSITIVE_FILE_PATTERNS[@]}"; do
    case "$normalized" in
      *"$pattern")
        return 0
        ;;
    esac
  done

  for regex in "${SENSITIVE_FILE_REGEX[@]}"; do
    if printf '%s\n' "$normalized" | grep -Eiq "$regex"; then
      return 0
    fi
  done

  return 1
}

resolve_diff_mode() {
  case "$CONFIG_GUARD_MODE" in
    pre-commit|pre-push)
      echo "$CONFIG_GUARD_MODE"
      return 0
      ;;
    auto)
      if git -C "$REPO_ROOT" rev-parse --verify "@{upstream}" >/dev/null 2>&1; then
        echo "pre-push"
      else
        echo "pre-commit"
      fi
      return 0
      ;;
    *)
      echo "pre-commit"
      return 0
      ;;
  esac
}

collect_added_lines() {
  local file="$1" mode="$2"
  local patch=""

  if [[ "$mode" == "pre-push" ]]; then
    if git -C "$REPO_ROOT" rev-parse --verify "@{upstream}" >/dev/null 2>&1; then
      patch="$(git -C "$REPO_ROOT" diff --no-color -U0 "@{upstream}...HEAD" -- "$file" 2>/dev/null || true)"
    elif git -C "$REPO_ROOT" rev-parse --verify "origin/HEAD" >/dev/null 2>&1; then
      patch="$(git -C "$REPO_ROOT" diff --no-color -U0 "origin/HEAD...HEAD" -- "$file" 2>/dev/null || true)"
    elif git -C "$REPO_ROOT" rev-parse --verify "HEAD~1" >/dev/null 2>&1; then
      patch="$(git -C "$REPO_ROOT" diff --no-color -U0 "HEAD~1..HEAD" -- "$file" 2>/dev/null || true)"
    else
      patch="$(git -C "$REPO_ROOT" show --no-color --pretty='' -U0 HEAD -- "$file" 2>/dev/null || true)"
    fi
  else
    patch="$(git -C "$REPO_ROOT" diff --cached --no-color -U0 -- "$file" 2>/dev/null || true)"
  fi

  printf '%s\n' "$patch" | grep -E '^\+[^+]' | sed 's/^\+//' || true
}

TARGET_FILES="$(collect_target_files "$@")"
if [[ -z "$TARGET_FILES" ]]; then
  exit 0
fi

DIFF_MODE="$(resolve_diff_mode)"

while IFS= read -r file_path; do
  [[ -z "$file_path" ]] && continue

  # --- Check against quality-gate config patterns -----------------------------
  for pattern in "${PROTECTED_CONFIG_PATTERNS[@]}"; do
    case "$file_path" in
      *"$pattern")
        block_violation \
          "Protected Config File" \
          "$file_path" \
          "Suffix pattern '$pattern' is protected" \
          "Quality-gate definition files must not be edited without review." \
          "Open a ticket/ADR, get approval, then run with CONFIG_GUARD_ALLOW=1."
        ;;
    esac
  done

  # --- Check against exact-match patterns -------------------------------------
  normalized="$file_path"
  normalized="${normalized#./}"
  normalized="${normalized#"$REPO_ROOT"/}"
  for exact in "${PROTECTED_CONFIG_EXACT[@]}"; do
    if [[ "$normalized" == "$exact" ]]; then
      block_violation \
        "Protected Config File" \
        "$file_path" \
        "Exact match '$exact' is protected" \
        "Quality-gate definition files must not be edited without review." \
        "Open a ticket/ADR, get approval, then run with CONFIG_GUARD_ALLOW=1."
    fi
  done

  # --- Check sensitive files --------------------------------------------------
  if is_sensitive_file "$file_path"; then
    block_violation \
      "Sensitive File Change" \
      "$file_path" \
      "Secret/credential-like file pattern is protected" \
      "Committing or pushing credential material can leak secrets permanently." \
      "Move secrets to secure vault/CI variables and commit only templates (e.g. .env.example)."
  fi

  # --- Check destructive operation patterns ----------------------------------
  while IFS= read -r added_line; do
    [[ -z "$added_line" ]] && continue

    for pattern in "${DESTRUCTIVE_OPERATION_PATTERNS[@]}"; do
      if printf '%s\n' "$added_line" | grep -Eiq "$pattern"; then
        block_violation \
          "Destructive Operation" \
          "$file_path" \
          "Matched pattern: $pattern" \
          "This added line can trigger dangerous deletion or irreversible data loss." \
          "Replace with a safe, scoped operation or document a reviewed migration/rollback plan."
      fi
    done
  done <<< "$(collect_added_lines "$file_path" "$DIFF_MODE")"
done <<< "$TARGET_FILES"

# Not a protected file – allow.
exit 0
