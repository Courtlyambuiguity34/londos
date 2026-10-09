#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec node scripts/local/launcher.mjs start local landlord
