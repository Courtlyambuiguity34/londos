#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
node --input-type=module -e 'if (Number(process.versions.node.split(".")[0]) !== 24) { throw new Error("Use the pinned Node 24 runtime before installation."); }'
npm ci --no-fund
npm run db:local
npm run db:migrate
npm run db:seed
npm run check
npm run test:integration
npm audit --audit-level=high
npm run build
npm run check:bundle-secrets
