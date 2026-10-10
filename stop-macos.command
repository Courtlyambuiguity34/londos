#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec scripts/local/run-with-node.sh stop "${1:-local}"
