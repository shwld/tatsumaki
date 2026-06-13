#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-shwld/tatsumaki}"
VERSION="${1:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

uname_s="$(uname -s)"
uname_m="$(uname -m)"

case "$uname_s" in
  Darwin) os="apple-darwin" ;;
  Linux) os="unknown-linux-gnu" ;;
  *)
    echo "Unsupported OS: $uname_s" >&2
    exit 1
    ;;
esac

case "$uname_m" in
  arm64|aarch64) arch="aarch64" ;;
  x86_64|amd64) arch="x86_64" ;;
  *)
    echo "Unsupported architecture: $uname_m" >&2
    exit 1
    ;;
esac

asset="tm-${arch}-${os}.tar.gz"

if [[ "$VERSION" == "latest" ]]; then
  url="https://github.com/${REPO}/releases/latest/download/${asset}"
else
  url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
fi

tmpdir="$(mktemp -d)"

curl -fL "$url" -o "$tmpdir/tm.tar.gz"
tar -xzf "$tmpdir/tm.tar.gz" -C "$tmpdir"
bin_path="$(find "$tmpdir" -type f -name tm | head -n 1)"

if [[ -z "${bin_path}" ]]; then
  echo "tm binary not found in archive: $asset" >&2
  exit 1
fi

sudo install -m 0755 "$bin_path" "${INSTALL_DIR}/tm"
echo "Installed tm to ${INSTALL_DIR}/tm"
"${INSTALL_DIR}/tm" --version
