#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_SKILLS_DIR="$REPO_ROOT/.claude/skills"
AGENT_SKILLS_DIR="$REPO_ROOT/.agents/skills"

if [[ ! -d "$CLAUDE_SKILLS_DIR" ]]; then
  echo "No .claude/skills directory found. Skip."
  exit 0
fi

if [[ ! -d "$AGENT_SKILLS_DIR" ]]; then
  echo "Missing .agents/skills. Run: bash scripts/sync-agent-skill-links.sh" >&2
  exit 1
fi

missing=()
broken=()
wrong_kind=()
while IFS= read -r skill_md; do
  skill_dir="$(dirname "$skill_md")"
  skill_name="$(basename "$skill_dir")"

  agent_path="$AGENT_SKILLS_DIR/$skill_name"
  want_target="../../.claude/skills/${skill_name}"

  if [[ ! -e "$agent_path" ]]; then
    missing+=("$skill_name")
    continue
  fi

  if [[ -L "$agent_path" && ! -e "$agent_path" ]]; then
    broken+=("$skill_name")
    continue
  fi

  if [[ ! -L "$agent_path" ]]; then
    wrong_kind+=("$skill_name")
    continue
  fi

  current_target="$(readlink "$agent_path" || true)"
  if [[ "$current_target" != "$want_target" ]]; then
    broken+=("$skill_name")
  fi
done < <(find "$CLAUDE_SKILLS_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md | sort)

if [[ "${#missing[@]}" -gt 0 || "${#broken[@]}" -gt 0 || "${#wrong_kind[@]}" -gt 0 ]]; then
  echo "Run: bash scripts/sync-agent-skill-links.sh" >&2
  echo "" >&2
fi

if [[ "${#missing[@]}" -gt 0 ]]; then
  echo "Missing .agents/skills links for:" >&2
  for skill_name in "${missing[@]}"; do
    echo "  - $skill_name" >&2
  done
fi

if [[ "${#wrong_kind[@]}" -gt 0 ]]; then
  echo "Not symlinks (expected ../../.claude/skills/<name>):" >&2
  for skill_name in "${wrong_kind[@]}"; do
    echo "  - $skill_name" >&2
  done
fi

if [[ "${#broken[@]}" -gt 0 ]]; then
  echo "Wrong or broken .agents/skills symlinks for:" >&2
  for skill_name in "${broken[@]}"; do
    echo "  - $skill_name" >&2
  done
fi

if [[ "${#missing[@]}" -gt 0 || "${#broken[@]}" -gt 0 || "${#wrong_kind[@]}" -gt 0 ]]; then
  exit 1
fi

echo "Skill link check passed."
