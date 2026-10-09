#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
exec node scripts/local/launcher.mjs start preview mall
