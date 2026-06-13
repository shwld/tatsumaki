#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

TARGET_DOCS=(
  "AGENTS.md"
  "CLAUDE.md"
  "docs/knowledge-index.md"
)

INDEX_FILE="docs/knowledge-index.md"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

all_links_file="$tmp_dir/all_links.txt"
index_paths_file="$tmp_dir/index_paths.txt"
missing_file="$tmp_dir/missing.txt"
unreferenced_file="$tmp_dir/unreferenced.txt"

touch "$all_links_file" "$index_paths_file" "$missing_file" "$unreferenced_file"

extract_links() {
  local source_file="$1"
  (grep -oE '\[[^]]+\]\(([^)]+)\)' "$REPO_ROOT/$source_file" || true) \
    | sed -E 's/.*\(([^)]+)\)/\1/' \
    | while IFS= read -r raw_link; do
      local link="$raw_link"
      link="${link%%#*}"
      link="${link%%\?*}"

      [[ -z "$link" ]] && continue
      [[ "$link" == http://* ]] && continue
      [[ "$link" == https://* ]] && continue
      [[ "$link" == mailto:* ]] && continue

      if [[ "$link" == /* ]]; then
        link="${link#/}"
      else
        local source_dir
        source_dir="$(dirname "$source_file")"
        if [[ "$source_dir" == "." ]]; then
          link="$link"
        else
          link="$source_dir/$link"
        fi
      fi

      link="${link#./}"
      echo "$source_file|$link" >>"$all_links_file"
    done
}

for doc in "${TARGET_DOCS[@]}"; do
  if [[ ! -f "$REPO_ROOT/$doc" ]]; then
    echo "Missing required document: $doc" >&2
    exit 1
  fi
  extract_links "$doc"
done

cut -d'|' -f2 "$all_links_file" | sort -u >"$tmp_dir/all_link_targets.txt"

while IFS='|' read -r source target; do
  if [[ ! -e "$REPO_ROOT/$target" ]]; then
    echo "$source -> $target" >>"$missing_file"
  fi
done <"$all_links_file"

grep -E '^- `[^`]+` \|' "$REPO_ROOT/$INDEX_FILE" | sed -E 's/^- `([^`]+)`.*/\1/' | sort -u >"$index_paths_file"

if [[ ! -s "$index_paths_file" ]]; then
  echo "Knowledge index has no entries: $INDEX_FILE" >&2
  exit 1
fi

while IFS= read -r indexed_path; do
  [[ "$indexed_path" == "AGENTS.md" ]] && continue
  [[ "$indexed_path" == "CLAUDE.md" ]] && continue
  [[ "$indexed_path" == "docs/knowledge-index.md" ]] && continue
  if ! grep -Fxq "$indexed_path" "$tmp_dir/all_link_targets.txt"; then
    echo "$indexed_path" >>"$unreferenced_file"
  fi
  if [[ ! -e "$REPO_ROOT/$indexed_path" ]]; then
    echo "$INDEX_FILE -> $indexed_path" >>"$missing_file"
  fi
done <"$index_paths_file"

if [[ -s "$missing_file" ]]; then
  echo "Broken links detected:" >&2
  sort -u "$missing_file" >&2
  exit 1
fi

if [[ -s "$unreferenced_file" ]]; then
  echo "Unreferenced knowledge index entries:" >&2
  sort -u "$unreferenced_file" >&2
  exit 1
fi

echo "Docs pointer link check passed."
