#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
exec scripts/local/run-with-node.sh start local shopkeeper
