#!/usr/bin/env bash
set -euo pipefail

# Enforce signed commits in pre-push.
# Reads refs from pre-push stdin: <local_ref> <local_sha> <remote_ref> <remote_sha>

ZERO_SHA="0000000000000000000000000000000000000000"
declare -a revspecs=()

if [[ -t 0 ]]; then
  # No pre-push ref lines on stdin (e.g. certain hook runners).
  # Fallback to upstream diff for current branch.
  if upstream_ref="$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null)"; then
    revspecs+=("${upstream_ref}..HEAD")
  else
    # First push without upstream: inspect commits not yet present on remotes.
    revspecs+=("HEAD" "--not" "--remotes")
  fi
else
  while IFS=' ' read -r local_ref local_sha remote_ref remote_sha; do
    [[ -z "${local_sha:-}" ]] && continue
    [[ "$local_sha" == "$ZERO_SHA" ]] && continue

    if [[ "${remote_sha:-$ZERO_SHA}" == "$ZERO_SHA" ]]; then
      # New remote ref. Only inspect commits not yet on any remote ref.
      revspecs+=("$local_sha" "--not" "--remotes")
    else
      revspecs+=("${remote_sha}..${local_sha}")
    fi
  done
fi

if [[ ${#revspecs[@]} -eq 0 ]]; then
  exit 0
fi

commits=()
while IFS= read -r commit; do
  commits+=("$commit")
done < <(git rev-list "${revspecs[@]}" | awk '!seen[$0]++')

if [[ ${#commits[@]} -eq 0 ]]; then
  exit 0
fi

unsigned=()
for commit in "${commits[@]}"; do
  sig_state="$(git log -1 --format=%G? "$commit")"
  if [[ "$sig_state" == "N" ]]; then
    unsigned+=("$commit")
  fi
done

if [[ ${#unsigned[@]} -eq 0 ]]; then
  exit 0
fi

echo "❌ Unsigned commits detected in push range:" >&2
for commit in "${unsigned[@]}"; do
  subject="$(git log -1 --format=%s "$commit")"
  echo "  - $commit $subject" >&2
done
echo "" >&2
echo "Set signing and recommit (or rebase with signed commits) before push." >&2
exit 1
