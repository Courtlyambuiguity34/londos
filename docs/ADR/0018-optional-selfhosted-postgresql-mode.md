# ADR-0018: Optional self-hosted PostgreSQL mode

## Status

Accepted for implementation on 2026-10-09. Production release approval remains a separate gate.

## Context

Londos needs a low-cost hosted default and a future owned-machine option without code forks,
dual-writes or a MongoDB migration. The current identity, tenancy, rent, audit, jobs, privacy and
recovery guarantees depend on PostgreSQL transactions and constraints. A browser/PWA must never
connect directly to any database.

## Decision

- `DEPLOY_MODE=render|selfhosted` selects deployment behavior; unset means `render`.
- `DATABASE_URL` always names the canonical PostgreSQL database.
- Render plus hosted Aiven PostgreSQL stays the default. Each Londos process uses a maximum
  three-connection client pool because Aiven's current free plan has `max_connections=20` and no
  PgBouncer.
- The supplied self-hosted production entry point requires `DEPLOY_MODE=selfhosted`, a loopback
  PostgreSQL URL and an existing production build. The web listener binds only to `127.0.0.1`.
- Cloudflare Tunnel may publish the HTTPS API hostname. PostgreSQL is never tunneled or publicly
  bound. Namecheap may remain registrar while Cloudflare is authoritative DNS.
- Up to three exact HTTPS PWA origins may be configured. Credentialed CORS headers are emitted only
  for those origins; requests marked cross-site remain denied. CORS is not authorization.
- Existing Mall/public, Shopkeeper merchant/shop and Landlord native-MFA/operator permission checks
  remain the actual data boundary.
- MongoDB stays optional and contains only manually refreshed public catalogue copies after current
  PostgreSQL eligibility checks. It is not a write authority, migration target or automatic failover.
- Migration is an explicit maintenance-window `pg_dump`/`pg_restore` cutover. There is no dual-write
  or automatic merge. Nightly self-hosted dumps are copied to configured off-machine storage.

## Consequences

An operator can move between hosted and owned-machine PostgreSQL through reviewed environment and
traffic changes, while application code and database authority remain stable. Self-hosting also
makes the operator responsible for power, patching, ingress, monitoring, backup restoration, DNS,
mail-record preservation and physical security. A single free Aiven node or single owned machine is
not highly available; neither may be represented as such.

## Operational reference

See [the self-hosted runbook](../../deploy/selfhosted/README.md),
[Connecting to Aiven Postgres](../../README.md#connecting-to-aiven-postgres), and
[Moving to self-hosting](../../README.md#moving-to-self-hosting).
