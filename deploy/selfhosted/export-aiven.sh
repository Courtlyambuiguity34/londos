#!/usr/bin/env sh
set -eu
SELFHOSTED_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$SELFHOSTED_DIR/postgres-tools.mjs" export-aiven "${1:-}"
