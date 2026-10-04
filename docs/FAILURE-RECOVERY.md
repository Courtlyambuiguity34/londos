# Failure & Recovery Requirements

## Recovery philosophy

Londos should assume machines, networks, providers, jobs and humans will fail. The design objective is controlled degradation and recoverability.

## Service priorities

### Tier 0 — trust/control
- authentication/authorization;
- tenancy/suspension state;
- rent ledger integrity;
- audit logs;
- backups/recovery.

### Tier 1 — public commerce
- public shop access;
- direct links;
- catalogue/product text;
- merchant contact methods.

### Tier 2 — discovery
- global/category/shop search;
- directory/recommendation.

### Tier 3 — enhancement
- analytics dashboards;
- AI shop designer;
- media transformation;
- non-urgent notifications.

Lower-tier failure should not unnecessarily take down higher-priority functions.

## Recovery objectives

Exact RTO/RPO values are not yet fixed. They must be selected before production based on cost and business impact.

Definitions:
- **RPO**: maximum acceptable data loss window.
- **RTO**: target time to restore a service after failure.

Set separate objectives for canonical database, media, search index and analytics because they have different recoverability.

## Canonical vs rebuildable

### Canonical / must protect
- merchant/account records;
- shops/departments/products;
- tenancy/rent ledger;
- shop design specification;
- verification/moderation records;
- critical messages where retained;
- audit records.

### Rebuildable
- search indexes;
- caches;
- image derivatives if compressed master/original policy retains a rebuild source;
- analytics aggregates.

Never treat the only copy of canonical business data as a cache/index.

## Backup strategy

Minimum design:
- automated database backups;
- encrypted media/object-storage protection/versioning appropriate to provider;
- encrypted independent/off-site copy;
- retention schedule;
- restore testing;
- monitoring for failed/stale backups.

## Incident runbooks required before production

- database corruption/outage;
- credential/secret compromise;
- Landlord account compromise;
- merchant account takeover;
- malicious upload;
- payment reconciliation incident;
- CDN/object-storage outage;
- accidental bulk deletion;
- data breach/privacy incident;
- domain/DNS compromise;
- backup restore.

## No irreversible one-click disaster

High-impact bulk/destructive operations should use:
- explicit authorization;
- step-up authentication;
- confirmation;
- bounded batch sizes where appropriate;
- audit;
- soft-delete/recovery windows where feasible.
