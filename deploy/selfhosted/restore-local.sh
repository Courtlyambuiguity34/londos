#!/usr/bin/env sh
set -eu
if [ "$#" -ne 1 ]; then echo "Usage: $0 PATH_TO_AIVEN_DUMP" >&2; exit 2; fi
SELFHOSTED_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$SELFHOSTED_DIR/postgres-tools.mjs" restore-local "$1"
