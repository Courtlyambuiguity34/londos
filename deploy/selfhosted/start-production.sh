#!/usr/bin/env sh
set -eu

SELFHOSTED_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROLE=${1:-web}
case "$ROLE" in
  web|worker) ;;
  *) echo "Usage: $0 [web|worker]" >&2; exit 2 ;;
esac
exec node "$SELFHOSTED_DIR/start-production.mjs" "$ROLE"
