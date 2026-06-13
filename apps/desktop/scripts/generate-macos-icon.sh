#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_IMAGE="${1:-$DESKTOP_DIR/static/icon-source.png}"
OUT_ICNS="$DESKTOP_DIR/assets/icon.icns"

if [[ ! -f "$SRC_IMAGE" ]]; then
  echo "Source image not found: $SRC_IMAGE" >&2
  exit 1
fi

for cmd in sips bunx; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

TMP_ICON="$DESKTOP_DIR/assets/icon-1024.png"
sips -z 1024 1024 "$SRC_IMAGE" --out "$TMP_ICON" >/dev/null
(cd "$DESKTOP_DIR" && bunx png2icons assets/icon-1024.png assets/icon -icns -bc)
rm -f "$TMP_ICON"

echo "Generated: $OUT_ICNS"
