#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_SKILL="$REPO_ROOT/agent-integrations/shared/skills/tatsumaki/SKILL.md"

TARGETS=(
  "$REPO_ROOT/agent-integrations/claude/plugins/tatsumaki/skills/tatsumaki/SKILL.md"
  "$REPO_ROOT/agent-integrations/codex/plugins/tatsumaki/skills/tatsumaki/SKILL.md"
  "$REPO_ROOT/agent-integrations/cursor/skills/tatsumaki/SKILL.md"
)

if [[ ! -f "$SOURCE_SKILL" ]]; then
  echo "Missing source skill: $SOURCE_SKILL" >&2
  exit 1
fi

for target in "${TARGETS[@]}"; do
  mkdir -p "$(dirname "$target")"
  cp "$SOURCE_SKILL" "$target"
  echo "Synced: ${target#$REPO_ROOT/}"
done

echo "Agent integration skills synced."
