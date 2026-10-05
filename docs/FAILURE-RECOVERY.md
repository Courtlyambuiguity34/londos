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

## Implemented local authenticated-owner incident runbook

This P9 development workflow uses fictional loopback data. It is verified in [incident evidence](evidence/X2-P9-INCIDENTS.md), with setup/commands in [DEVELOPMENT](DEVELOPMENT.md) and authority in [ADR-0009](ADR/0009-local-incidents-and-owner-confirmed-recovery.md). Live escalation response targets, identity adjudication, support ownership, production disaster recovery and legal retention still require their own decisions and rehearsals.

1. A current freshly authenticated owner reports the incident from the affected shop. Select security/account recovery or contact/payment-instruction change as appropriate. Include a bounded fictional description; never include passwords, factor/recovery codes or real documents. For contact recovery, select the exact known earlier snapshot available in captured history.
2. A kind-authorized reviewer completes native MFA and claims the incident with a reason. Investigate privately; communicate a separate safe owner-facing explanation. Ordinary support cannot perform sensitive recovery. If another qualified reviewer is needed, escalate with a reason: assignment/private scopes are released, and the next reviewer must explicitly claim.
3. When investigation warrants local account containment, the assigned recovery reviewer confirms the current case/version and revokes the reporting active owner's sessions once. Verify prior sessions and old reset links are unusable. This does not rotate passwords/factors/email, transfer ownership or permanently stop future login; use the native account-security/password flow for credential changes. No other merchant/account may be selected.
4. The original reporting owner signs in again using the native password and enrolled MFA or an unused recovery code. Request a new native reset link when needed, through the private local sink. A previously issued reset token is invalid after containment. Never copy tokens into public URLs, logs, case notes, issues or commits.
5. After securing the account, the original still-active owner reviews the exact historic contact snapshot and separately confirms it with fresh authentication/current case/contact versions and a reason. Approval expires after 30 minutes and binds credential generation. Later contact edits, expiry, owner revocation or password/factor changes require re-confirmation.
6. The assigned recovery reviewer reloads, reviews the current approval and restores with fresh MFA/reason/confirmation. Verify the new canonical contact version matches the selected snapshot and earlier/intervening history remains. A conflict requires reloading/review; never overwrite a conflicting revision or invent approval. Rent, ledger, publication, moderation and operational holds remain independent.
7. Resolve with a safe explanation, retain immutable case/events/audit, and confirm private notices contain only minimal status identifiers. Do not delete history as part of resolution or tenancy closure.

If the owner cannot authenticate with the native recovery mechanisms, or identity/email/ownership is disputed, this implementation cannot safely approve recovery. Preserve the incident and escalate through a separately approved proof process once established; no SQL password/MFA reset, membership transfer or ordinary support override is an authorized incident command. This local runbook does not claim recovery of an account after all proof factors are lost, cancellation of already-authorized work, a production SLA, or restoration from backup.
