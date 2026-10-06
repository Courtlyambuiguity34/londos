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

## Local privacy erasure and restore obligations

Use [ADR-0011](ADR/0011-local-privacy-governance.md), [development instructions](DEVELOPMENT.md) and [privacy evidence](evidence/X2-P9-PRIVACY.md). Main erasure remains off. No legal retention period, production backup expiry or actual restore drill is approved by this development workflow.

1. A fresh current owner requests review for an exact existing resource. Export only authorized allowlisted business sections; these are not complete subject-access/account snapshots. Keep downloaded data private.
2. An explicitly privacy-authorized native-MFA reviewer claims the versioned case. Inspect eligibility without reading raw customer/evidence content. Record private review reasoning separately from the safe owner explanation. Preserve financial/legal/investigation history; hold exact targets requiring retention.
3. Release a hold only with an authorized reasoned decision. Cancellation, denial, unassignment and arrears closure never remove holds or primary records. Unassign to another qualified reviewer when needed, clearing prior approval; re-claim must establish new scope.
4. In explicitly enabled fictional test mode, approve only the current eligible plan. Five-minute approval and current native session/MFA/grant/scope/requester ownership are rechecked by the fenced worker. Disabled/offline execution is incomplete; expiry, changed target or lost authority requires fresh review. Inspect status/history and retry state rather than bypassing SQL guards or fabricating completion.
5. Verify the primary effect and durable result: three enquiry fields scrubbed with minimal receipt retained; rejected nonfinancial original-actor evidence bytes removed with history retained; shop metrics removed and future capture permanently excluded. Atomic failures retain original data and no completion receipt. An old lease cannot repeat effects.
6. Treat completed primary erasure as irreversible. Backup/WAL/platform snapshots, previous downloads, notification files and external copies remain outside the result. Before exposing any restored dataset, reconcile/reapply trusted erasure receipts and exclusions newer than that backup. Keep it isolated if the authoritative record set is missing; do not resurrect content or resume shop capture. Application tools alone do not prove that physical backup copies have expired or been deleted.
7. A production restore mechanism must preserve immutable holds/audit, enforce current erasure markers before access, define approved backup expiry and notification/external-copy handling, and rehearse restore verification. These release gates remain unfinished; do not advertise full legal/account deletion or safe production restore from these local tests.


## Local reported-cost corrections and outages

Use [ADR-0012](ADR/0012-local-resource-cost-reporting.md), [development instructions](DEVELOPMENT.md) and [cost evidence](evidence/X2-P9-COSTS.md). This is a fictional reporting journal, separate from the immutable rent ledger and privacy effect history.

1. Sign in natively and complete fresh MFA as an explicitly costs-authorized operator. Use an unused recovery code if required; replaying a previously accepted TOTP/recovery code is correctly rejected. Claim the affected canonical shop separately with current shop version, reason and confirmation. Other operator scopes cannot authorize reporting.
2. On an outage or lost command response, retain the original retry key and unchanged payload. Reload the journal after service recovery to inspect whether the transaction committed. An unchanged retry returns its original entry; changed key/body reuse conflicts. Never infer success from a click or unavailable resource data.
3. On a version conflict, reload and review current history before issuing a new command. Do not overwrite another reporter’s work or bypass revoked ownership/grants/scopes/MFA with SQL. A denied or failed transaction leaves no new entry, journal version or audit effect.
4. Correct a mistaken report by appending an exact linked reversal with a private reason and confirmation. Original category/day/currency/units are retained, at most one correction exists and the original remains visible. Add a separately confirmed replacement if needed. The daily original-entry limit never prevents exact correction. No invoice, rent credit, tenancy, publication, moderation, operations, hold or worker state changes.
5. Treat net sums as operator-reported amounts with unknown coverage. Corrections affect the original UTC work day; older journal records remain accessible through 20-row UUID pages. Missing measurements remain unavailable. There is no automatic journal purge, provider billing reconciliation or legal retention approval; maintain protected history and the existing privacy/backup restore obligations above.

Keep real customer information, private evidence and credentials out of reporting reasons. Restoring a reporting journal is not a physical backup rehearsal or evidence of actual operating charges. Existing canonical workflows and queues must remain usable when cost reads fail; do not alter queue replay/lease behavior to manufacture cost counters.
