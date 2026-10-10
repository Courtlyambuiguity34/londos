#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
NODE_VERSION=24.19.0
BOOTSTRAP=false

if [ "${1:-}" = "--bootstrap" ]; then
  BOOTSTRAP=true
  shift
fi

platform=$(uname -s)
case "$platform" in
  Linux) node_platform=linux ;;
  Darwin) node_platform=darwin ;;
  *)
    echo "Unsupported platform: $platform. Use the Windows installer on Windows." >&2
    exit 1
    ;;
esac

machine=$(uname -m)
case "$machine" in
  x86_64|amd64) node_arch=x64 ;;
  arm64|aarch64) node_arch=arm64 ;;
  *)
    echo "Unsupported processor architecture: $machine (supported: x64 and arm64)." >&2
    exit 1
    ;;
esac

archive="node-v${NODE_VERSION}-${node_platform}-${node_arch}.tar.gz"
runtime="$ROOT/.local/runtime/node-v${NODE_VERSION}-${node_platform}-${node_arch}"
private_node="$runtime/bin/node"

node_is_supported() {
  "$1" -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major === 24 && minor >= 19 ? 0 : 1);
  ' >/dev/null 2>&1
}

download_node() {
  base_url="https://nodejs.org/dist/v${NODE_VERSION}"
  downloads="$ROOT/.local/runtime/downloads"
  staging="$ROOT/.local/runtime/.node-v${NODE_VERSION}-${node_platform}-${node_arch}-$$"
  archive_path="$downloads/$archive"
  sums_path="$downloads/SHASUMS256-v${NODE_VERSION}.txt"

  mkdir -p "$downloads"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --proto '=https' --tlsv1.2 --retry 3 \
      --output "$sums_path" "$base_url/SHASUMS256.txt"
    curl --fail --location --proto '=https' --tlsv1.2 --retry 3 \
      --output "$archive_path" "$base_url/$archive"
  elif command -v wget >/dev/null 2>&1; then
    wget --https-only --tries=3 --output-document="$sums_path" "$base_url/SHASUMS256.txt"
    wget --https-only --tries=3 --output-document="$archive_path" "$base_url/$archive"
  else
    echo "Node download needs curl or wget. Install one with your operating-system package manager." >&2
    exit 1
  fi

  expected=$(awk -v file="$archive" '$2 == file || $2 == "*" file { print $1; exit }' "$sums_path")
  if [ -z "$expected" ]; then
    echo "The official Node checksum list does not contain $archive." >&2
    exit 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$archive_path" | awk '{ print $1 }')
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$archive_path" | awk '{ print $1 }')
  else
    echo "Node verification needs sha256sum or shasum; refusing an unverified runtime." >&2
    exit 1
  fi
  if [ "$actual" != "$expected" ]; then
    echo "Node archive checksum verification failed; refusing to extract it." >&2
    exit 1
  fi

  rm -rf "$staging"
  mkdir -p "$staging"
  tar -xzf "$archive_path" -C "$staging"
  extracted="$staging/node-v${NODE_VERSION}-${node_platform}-${node_arch}"
  if [ ! -x "$extracted/bin/node" ] || ! node_is_supported "$extracted/bin/node"; then
    echo "The verified Node archive did not contain the expected executable." >&2
    exit 1
  fi
  rm -rf "$runtime"
  mv "$extracted" "$runtime"
  rm -rf "$staging"
  echo "Installed verified private Node.js $NODE_VERSION for $node_platform-$node_arch."
}

if [ "$BOOTSTRAP" = true ]; then
  if [ ! -x "$private_node" ] || ! node_is_supported "$private_node"; then
    echo "Downloading the pinned private Node.js runtime from nodejs.org..."
    download_node
  fi
  node_command=$private_node
elif [ -x "$private_node" ] && node_is_supported "$private_node"; then
  node_command=$private_node
elif command -v node >/dev/null 2>&1 && node_is_supported "$(command -v node)"; then
  node_command=$(command -v node)
else
  echo "Londos needs Node.js 24.19+ in the 24.x line. Run the INSTALL shortcut first." >&2
  exit 1
fi

PATH="$(dirname "$node_command"):$PATH"
export PATH
cd "$ROOT"
exec "$node_command" scripts/local/launcher.mjs "$@"
