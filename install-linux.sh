#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
exec scripts/local/bootstrap-prerequisites.sh "${1:-local}"
