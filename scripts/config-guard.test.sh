#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD_SCRIPT="$REPO_ROOT/scripts/config-guard.sh"

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

assert_exit_code() {
  local expected="$1"
  local actual="$2"
  local message="$3"

  if [[ "$expected" != "$actual" ]]; then
    fail "$message (expected=$expected actual=$actual)"
  fi
}

assert_contains() {
  local needle="$1"
  local haystack="$2"
  local message="$3"

  if ! printf '%s' "$haystack" | grep -Fq "$needle"; then
    fail "$message (needle=$needle)"
  fi
}

run_guard() {
  local mode="$1"
  shift

  set +e
  local output
  output="$(CONFIG_GUARD_MODE="$mode" CONFIG_GUARD_REPO_ROOT="$TMP_DIR" bash "$GUARD_SCRIPT" "$@" 2>&1)"
  local status=$?
  set -e

  printf '%s\n%s' "$status" "$output"
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$TMP_DIR"
git init -q
git config user.name "config-guard-test"
git config user.email "config-guard-test@example.com"
git config commit.gpgsign false
mkdir -p "$TMP_DIR/.githooks"
git config core.hooksPath "$TMP_DIR/.githooks"

cat > README.md <<'TXT'
# test
TXT
git add README.md
git commit -q --no-verify -m "init"

test_sensitive_file_is_blocked() {
  cat > .env <<'TXT'
API_TOKEN=secret
TXT
  git add .env

  local result
  result="$(run_guard pre-commit .env)"
  local status="$(printf '%s' "$result" | head -n1)"
  local output="$(printf '%s' "$result" | tail -n +2)"

  assert_exit_code 2 "$status" "sensitive file change must be blocked"
  assert_contains "Sensitive File Change" "$output" "sensitive change should show violation type"
  assert_contains "credential material" "$output" "sensitive change should explain reason"

  git reset -q HEAD .env
  rm -f .env
}

test_destructive_operation_is_blocked() {
  cat > cleanup.sh <<'TXT'
#!/usr/bin/env bash
rm -rf /
TXT
  chmod +x cleanup.sh
  git add cleanup.sh

  local result
  result="$(run_guard pre-commit cleanup.sh)"
  local status="$(printf '%s' "$result" | head -n1)"
  local output="$(printf '%s' "$result" | tail -n +2)"

  assert_exit_code 2 "$status" "destructive operation must be blocked"
  assert_contains "Destructive Operation" "$output" "destructive change should show violation type"
  assert_contains "dangerous deletion" "$output" "destructive change should explain reason"

  git reset -q HEAD cleanup.sh
  rm -f cleanup.sh
}

test_apps_web_package_json_is_blocked() {
  mkdir -p "$TMP_DIR/apps/web"
  echo '{}' >"$TMP_DIR/apps/web/package.json"
  git add apps/web/package.json

  local result
  result="$(run_guard pre-commit apps/web/package.json)"
  local status
  status="$(printf '%s' "$result" | head -n1)"
  local output
  output="$(printf '%s' "$result" | tail -n +2)"

  assert_exit_code 2 "$status" "apps/web/package.json change must be blocked"
  assert_contains "Protected Config" "$output" "apps/web package should show protected violation"

  git reset -q HEAD apps/web/package.json
  rm -f "$TMP_DIR/apps/web/package.json"
  rmdir "$TMP_DIR/apps/web"
}

test_safe_change_is_allowed() {
  cat > script.sh <<'TXT'
#!/usr/bin/env bash
echo "hello"
TXT
  chmod +x script.sh
  git add script.sh

  local result
  result="$(run_guard pre-commit script.sh)"
  local status="$(printf '%s' "$result" | head -n1)"

  assert_exit_code 0 "$status" "safe change should pass"

  git commit -q --no-verify -m "add safe script"
}

test_pre_push_mode_blocks_committed_destructive_change() {
  local remote_dir="$TMP_DIR/remote.git"
  git init -q --bare "$remote_dir"
  git remote add origin "$remote_dir"
  git push -q -u origin HEAD

  cat > dangerous.sql <<'TXT'
DROP DATABASE production;
TXT
  git add dangerous.sql
  git commit -q --no-verify -m "add dangerous sql"

  local result
  result="$(run_guard pre-push dangerous.sql)"
  local status="$(printf '%s' "$result" | head -n1)"
  local output="$(printf '%s' "$result" | tail -n +2)"

  assert_exit_code 2 "$status" "pre-push should block committed destructive change"
  assert_contains "Destructive Operation" "$output" "pre-push output should include violation type"
}

test_sensitive_file_is_blocked
test_destructive_operation_is_blocked
test_apps_web_package_json_is_blocked
test_safe_change_is_allowed
test_pre_push_mode_blocks_committed_destructive_change

echo "[PASS] config-guard tests passed"
