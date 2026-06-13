#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is required. Install GitHub CLI first." >&2
  exit 1
fi

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Usage: bash scripts/cli-release-upload.sh <tag>" >&2
  echo "Example: bash scripts/cli-release-upload.sh cli-v0.0.2" >&2
  exit 1
fi

if [[ ! "$TAG" =~ ^cli-v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  echo "Tag must match cli-v<semver> (example: cli-v0.0.5)." >&2
  exit 1
fi
CLI_VERSION="${BASH_REMATCH[1]}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required." >&2
  exit 1
fi

if ! command -v rustup >/dev/null 2>&1; then
  echo "rustup is required." >&2
  exit 1
fi

if ! command -v zig >/dev/null 2>&1; then
  echo "zig is required for cross build. Install zig first." >&2
  exit 1
fi

if ! command -v cargo-zigbuild >/dev/null 2>&1; then
  cargo install cargo-zigbuild --locked
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required." >&2
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "This script must run inside a git repository." >&2
  exit 1
fi

set_version_in_file() {
  local file="$1"
  local pattern="$2"
  local replacement="$3"

  if grep -qE "$pattern" "$file"; then
    sed -i.bak -E "s/${pattern}/${replacement}/g" "$file"
    rm -f "${file}.bak"
  else
    echo "Expected pattern not found in ${file}: ${pattern}" >&2
    exit 1
  fi
}

set_version_in_file \
  "apps/cli/crates/tm/Cargo.toml" \
  '^version = "[0-9]+\.[0-9]+\.[0-9]+"$' \
  "version = \"${CLI_VERSION}\""

set_version_in_file \
  "apps/web/src/application/usecases/get-cli-version-compatibility.ts" \
  'apiVersion: "[0-9]+\.[0-9]+\.[0-9]+"' \
  "apiVersion: \"${CLI_VERSION}\""

set_version_in_file \
  "apps/web/src/application/usecases/get-cli-version-compatibility.ts" \
  'minClientVersion: "[0-9]+\.[0-9]+\.[0-9]+"' \
  "minClientVersion: \"${CLI_VERSION}\""

set_version_in_file \
  "apps/web/src/presentation/openapi/cli-openapi.ts" \
  'version: "[0-9]+\.[0-9]+\.[0-9]+"' \
  "version: \"${CLI_VERSION}\""

set_version_in_file \
  "apps/web/test/cli.route.test.ts" \
  'apiVersion: "[0-9]+\.[0-9]+\.[0-9]+"' \
  "apiVersion: \"${CLI_VERSION}\""

set_version_in_file \
  "apps/web/test/cli.route.test.ts" \
  'minClientVersion: "[0-9]+\.[0-9]+\.[0-9]+"' \
  "minClientVersion: \"${CLI_VERSION}\""

cargo check --manifest-path apps/cli/Cargo.toml
bun run openapi:generate

if ! git diff --quiet -- \
  apps/cli/crates/tm/Cargo.toml \
  apps/cli/Cargo.lock \
  apps/web/src/application/usecases/get-cli-version-compatibility.ts \
  apps/web/src/presentation/openapi/cli-openapi.ts \
  apps/web/test/cli.route.test.ts \
  packages/contracts/cli-openapi.json \
  apps/web/openapi/cli-openapi.json; then
  current_branch="$(git branch --show-current)"
  if [[ -z "${current_branch}" ]]; then
    current_branch="codex/cli-release-${CLI_VERSION}"
    git switch -c "${current_branch}"
  fi

  git add \
    apps/cli/crates/tm/Cargo.toml \
    apps/cli/Cargo.lock \
    apps/web/src/application/usecases/get-cli-version-compatibility.ts \
    apps/web/src/presentation/openapi/cli-openapi.ts \
    apps/web/test/cli.route.test.ts \
    packages/contracts/cli-openapi.json \
    apps/web/openapi/cli-openapi.json
  git commit -m "chore(cli): sync version metadata to ${CLI_VERSION}"
  git push -u origin "${current_branch}"
fi

ASSETS=(
  "tm-aarch64-apple-darwin.tar.gz"
  "tm-x86_64-apple-darwin.tar.gz"
  "tm-aarch64-unknown-linux-gnu.tar.gz"
  "tm-x86_64-unknown-linux-gnu.tar.gz"
  "sha256sums.txt"
  "install-tm.sh"
)

TARGETS=(
  "aarch64-apple-darwin"
  "x86_64-apple-darwin"
  "aarch64-unknown-linux-gnu"
  "x86_64-unknown-linux-gnu"
)

OUTPUT_DIR="${OUTPUT_DIR:-artifacts/cli-release/${TAG}}"
mkdir -p "$OUTPUT_DIR"

HOST_TARGET="$(rustc -vV | awk '/host:/ {print $2}')"

for target in "${TARGETS[@]}"; do
  rustup target add "$target"
done

for target in "${TARGETS[@]}"; do
  if [[ "$target" == "$HOST_TARGET" ]]; then
    cargo build --manifest-path apps/cli/Cargo.toml --release --target "$target"
  else
    cargo zigbuild --manifest-path apps/cli/Cargo.toml --release --target "$target"
  fi
done

for target in "${TARGETS[@]}"; do
  target_dir="${OUTPUT_DIR}/${target}"
  mkdir -p "$target_dir"
  cp "apps/cli/target/${target}/release/tm" "${target_dir}/tm"
  tar -C "$target_dir" -czf "${OUTPUT_DIR}/tm-${target}.tar.gz" tm
done

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && sha256sum tm-*.tar.gz > sha256sums.txt)
else
  (cd "$OUTPUT_DIR" && shasum -a 256 tm-*.tar.gz > sha256sums.txt)
fi

cp scripts/install-tm.sh "${OUTPUT_DIR}/install-tm.sh"
chmod 0755 "${OUTPUT_DIR}/install-tm.sh"

if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" --title "$TAG" --notes "Automated release creation from local upload script."
fi
upload_paths=()
for asset in "${ASSETS[@]}"; do
  upload_paths+=("${OUTPUT_DIR}/${asset}")
done
gh release upload "$TAG" "${upload_paths[@]}" --clobber

echo "Uploaded assets to release: $TAG"
