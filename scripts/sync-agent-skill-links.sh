#!/usr/bin/env bash
# Sync .agents/skills/<name> -> ../../.claude/skills/<name> for every skill with SKILL.md.
# Idempotent: creates missing links, fixes wrong targets, removes stale/broken symlinks.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_SKILLS_DIR="$REPO_ROOT/.claude/skills"
AGENT_SKILLS_DIR="$REPO_ROOT/.agents/skills"
DRY_RUN="${SYNC_AGENT_SKILLS_DRY_RUN:-0}"

if [[ ! -d "$CLAUDE_SKILLS_DIR" ]]; then
  echo "No $CLAUDE_SKILLS_DIR; nothing to do."
  exit 0
fi

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY: $*"
  else
    "$@"
  fi
}

mkdir -p "$AGENT_SKILLS_DIR"

expected_target_for() {
  local name="$1"
  printf '../../.claude/skills/%s' "$name"
}

# 1) Ensure symlink for each .claude skill (SKILL.md)
while IFS= read -r skill_md; do
  [[ -n "$skill_md" ]] || continue
  skill_name="$(basename "$(dirname "$skill_md")")"
  agent_path="$AGENT_SKILLS_DIR/$skill_name"
  want_target="$(expected_target_for "$skill_name")"

  if [[ -L "$agent_path" ]]; then
    current="$(readlink "$agent_path" || true)"
    if [[ "$current" != "$want_target" ]]; then
      echo "Relink: $agent_path -> $want_target (was: ${current:-<empty>})"
      run rm -f "$agent_path"
      run ln -s "$want_target" "$agent_path"
    elif [[ ! -e "$agent_path" ]]; then
      echo "Fix broken symlink: $agent_path -> $want_target"
      run rm -f "$agent_path"
      run ln -s "$want_target" "$agent_path"
    fi
  elif [[ -e "$agent_path" ]]; then
    echo "WARN: $agent_path exists and is not a symlink; remove or rename it, then re-run." >&2
    continue
  else
    echo "Add symlink: $agent_path -> $want_target"
    run ln -s "$want_target" "$agent_path"
  fi
done < <(find "$CLAUDE_SKILLS_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md 2>/dev/null | sort)

# 2) Remove agent entries that no longer have a .claude skill
shopt -s nullglob
for agent_path in "$AGENT_SKILLS_DIR"/*; do
  [[ -e "$agent_path" ]] || continue
  name="$(basename "$agent_path")"
  claude_skill_md="$CLAUDE_SKILLS_DIR/$name/SKILL.md"

  if [[ -f "$claude_skill_md" ]]; then
    continue
  fi

  if [[ -L "$agent_path" ]]; then
    echo "Remove stale symlink (no .claude skill): $name"
    run rm -f "$agent_path"
  elif [[ -d "$agent_path" ]]; then
    echo "WARN: $agent_path is a directory but $claude_skill_md is missing; not deleting." >&2
  fi
done
shopt -u nullglob

echo "Agent skill symlinks synced."
