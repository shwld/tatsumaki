#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_PATH="${1:-$(find "$DESKTOP_DIR/out" -type d -name '*.app' | head -n 1)}"
DMG_PATH="${2:-$(find "$DESKTOP_DIR/out/make" -type f -name '*.dmg' | head -n 1)}"

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "No .app artifact found. Pass app path as first arg." >&2
  exit 1
fi

if [[ -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "No .dmg artifact found. Pass dmg path as second arg." >&2
  exit 1
fi

strict_mode="${DESKTOP_MAC_SIGN_REQUIRED:-false}"

echo "Checking Gatekeeper assessment for app: $APP_PATH"
if ! spctl -a -vv "$APP_PATH"; then
  if [[ "$strict_mode" == "true" ]]; then
    exit 1
  fi
  echo "WARN: Gatekeeper assessment failed on unsigned/local artifact (continuing)." >&2
fi

echo "Checking notarization ticket for app"
if ! stapler validate "$APP_PATH"; then
  if [[ "$strict_mode" == "true" ]]; then
    exit 1
  fi
  echo "WARN: stapler validation failed on app (likely unsigned/local artifact)." >&2
fi

echo "Checking notarization ticket for dmg: $DMG_PATH"
if ! stapler validate "$DMG_PATH"; then
  if [[ "$strict_mode" == "true" ]]; then
    exit 1
  fi
  echo "WARN: stapler validation failed on dmg (likely unsigned/local artifact)." >&2
fi

cat <<MSG
Verification commands completed.
Manual check still required:
  open "$APP_PATH"
MSG
