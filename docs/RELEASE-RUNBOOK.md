# P12 release and recovery runbook

This packet prepares **isolated staging**, with a production-compiled application. Production deployment is not authorized and G5 remains open. Native authentication, notifications, rent and privacy workflows still deliberately require the loopback development adapters. Do not remove that guard to make a public domain appear ready. Read the [P12 dossier](evidence/P12.md), [release definition](../deploy/compose.staging.yaml), [recovery result](evidence/P12-RECOVERY.json) and [provider status](AI-ENVIRONMENT.md).

## Artifacts and environment separation

Use Node 24.19.0/npm 11.9.0, the unchanged lockfile and frozen migrations 001–018. [Dockerfile](../deploy/Dockerfile) pins Node by digest; Compose pins PostgreSQL 18 by digest. The image contains standalone web/static/public assets, production dependencies, independent worker, monitoring CLI and a separately invoked migration command. Run as UID 1000 with a read-only root, dropped capabilities, no new privileges, bounded memory/CPU/processes, writable temporary/cache paths and a durable private notification volume. Keep the image registry private and deploy an approved immutable digest. Rebuilding from pinned inputs is supported; byte-identical rebuilds are not claimed.

```bash
BUILDX_CONFIG="$PWD/.local/buildx" docker --host=unix:///var/run/docker.sock build \
  --secret id=proxy_ca,src="$CODEX_PROXY_CERT" \
  -f deploy/Dockerfile -t londos:p12-candidate .
```

The managed cloud build uses its ordinary proxy configuration and CA secret; do not disable certificate verification or put proxy credentials into build arguments. Outside that cloud, omit the optional CA secret when unnecessary. Runtime remote providers need a mounted trusted CA through `LONDOS_RUNTIME_CA_FILE` and the platform's normal proxy configuration; neither is baked into the image. The Docker context excludes private settings, recovery material, Git and local build/test directories.

Development, staging and production need separate PostgreSQL clusters, authentication secrets, delivery sinks, recovery keys and provider accounts/limits. No production credentials or merchant records were used by the rehearsal. `.local/p12-recovery-*` holds fictional private diagnostics, generated credentials and encrypted/plain temporary rehearsal archives; it is not an operational off-site backup.

### Staging bootstrap

Set `LONDOS_IMAGE` to the recorded image digest and `LONDOS_SECRETS_DIR` to a protected directory outside the repository and web volume. Provision independent random credentials through the environment's secret manager. Files must be readable by the intended container UID only; local Compose bind-mounted secrets do not universally implement the declared secret UID/mode. Verify access on the selected host. Required files:

| File | Content / consumer |
|---|---|
| `migration-password` | Random database bootstrap password; PostgreSQL only |
| `migration-database-url` | `postgresql://londos_migrator:<encoded password>@database:5432/londos_staging`; migration job only |
| `runtime-passwords.json` | Exactly `web`, `worker`, `monitor`, each a different 64-character lowercase hex password; migration job only |
| `web-database-url`, `worker-database-url`, `monitor-database-url` | Corresponding `londos_web`, `londos_worker`, `londos_monitor` database URL with the same separately generated role password |
| `auth-secret` | Independent random secret, at least 32 characters; web/worker |

Secret values must not enter chat, Git, shell history, client output or log collectors. The entrypoint supports `DATABASE_URL_FILE`, `AUTH_SECRET_FILE` and the mapped provider key `_FILE` names and refuses ambiguous file/environment sources.

```bash
docker compose -f deploy/compose.staging.yaml config --quiet
docker compose -f deploy/compose.staging.yaml up -d database
docker compose -f deploy/compose.staging.yaml --profile bootstrap run --rm migration
docker compose -f deploy/compose.staging.yaml up -d web-a web-b worker
```

The migration command verifies every existing checksum, applies unapplied migrations with the established advisory lock/transaction protocol, and provisions runtime grants when the protected password file is supplied. It is not an application startup side effect. Stop on any checksum mismatch; never edit an applied migration. The empty staging database is not silently seeded or granted real operator identities. The disposable rehearsal separately creates fictional native accounts and explicit scoped grants.

Web and worker have distinct credentials and a shared non-owner application DML role. They cannot create/alter schemas, truncate tables, rewrite migrations or bypass immutable finance/history triggers. Tenant authorization remains in the application; this does **not** implement PostgreSQL row-level security or containment after complete application credential compromise. Review grants after each migration; new tables get no automatic broad default grant. The monitor can read only an aggregate security-barrier view, not account or business tables. Migration credentials are administrative and never mounted into normal web/worker containers.

Two web pools plus one worker pool are capped at 10 connections each; role limits are web 24, worker 12, monitor 2. PostgreSQL's default 100 leaves maintenance/headroom; connection alert starts at 70. Reassess before changing replicas. Existing database advisory locks/unique jobs own scheduling, so overlapping workers remain fenced. The Compose restart policy is process supervision; an unhealthy-but-running process still requires an operator action. Worker health checks the particular process UUID, not another worker's heartbeat. Allow 35 seconds for its 20-second bounded handler to drain. Web readiness requires database/schema/authentication capability; worker readiness is separately reported. Fixture-preview readiness alone is not a release acceptance signal.

## TLS, routing and caches

[NGINX staging configuration](../deploy/nginx.staging.conf) is exercised with a pinned image, ephemeral verified localhost certificate, two compiled replicas, non-root/read-only execution and private/no-store responses. It overwrites incoming forwarded/client-IP headers. Anonymous requests following authenticated requests cannot recover private responses; canonical edits are visible through both replicas. The host bindings are loopback only. No shared response cache or CDN is enabled.

The rehearsal's self-signed certificate proves local TLS wiring only. A production host still needs approved region/domain ownership, registrar MFA, managed renewal/expiry alerts, verified chain/hostname and secure canonical authentication origin/cookies, trusted ingress configuration and no direct backend exposure. Configure the CDN to bypass authenticated/API/dynamic shop responses and to respect current eligibility for media. Never cache quarantine/original uploads. Rehearse purges, revocation/closure and direct-origin denial against the selected provider before enabling caching. Static hashed assets may have their own reviewed policy. The current loopback authentication adapter remains a blocker to public deployment.

## Monitoring and ownership

Run the compiled `monitor` command at least once per minute under the host scheduler. The Compose operations profile performs one probe and exits. Exit 0 is clean, 2 means alerts, 1 means monitoring itself failed. Schedule failures must alert too. All output is redacted JSON/aggregate counts; there is no external message delivery in this packet.

```bash
docker compose -f deploy/compose.staging.yaml --profile operations run --rm monitor
```

A verified backup receipt may be mounted privately and selected with `LONDOS_BACKUP_RECEIPT_FILE`. Its JSON fields are `completedAt` (ISO time), `verified` (boolean), and `independentCopy` (boolean). Never mark the latter true for this same-host rehearsal. Missing, malformed, future, unverified or older-than-24-hour receipts alert. Successful copying alone is not a successful restore. Keep evidence of the independent destination and latest restore separately.

| Signal | Provisional threshold | Response |
|---|---|---|
| Web readiness / monitor failure | Any failure | Database-outage procedure; page assigned operator |
| Own worker heartbeat | Older than 30 seconds / absent | Worker-backlog procedure |
| Pending oldest job / dead job | Over 60 seconds / any | Inspect redacted kind/lease/retry state; avoid forced duplicate effects |
| Projection lag | Any shop behind canonical version | Worker-backlog procedure; public reads still enforce canonical state |
| Failed media | Any failed asset or current processing job dead | Media-outage procedure |
| Partial rent credits | Any positive net credit below invoice amount | Rent-reconciliation procedure |
| Global auth request budget | 300/minute in current/recent five-minute windows | Credential-compromise procedure; inspect aggregate abuse |
| Connections / probe latency | 70 connections / over 1 second | Check saturation before adding replicas |
| Database / media bytes | Over 10 GiB / 5 GiB | Capacity review; never delete canonical content blindly |
| Backup age / independent copy | Over 24 hours / unverified | Backup-restore procedure; block release |

These thresholds are engineering staging defaults, not approved SLAs. The restore report records observed baseline aggregates; historical P11 load tests are not re-labelled as P12 throughput measurements. Recorded AI attempt costs are estimates, not bills. External object-store/CDN bandwidth, provider bills, HTTP error-rate dashboards, log retention, on-call channel and a tested alert recipient remain launch configuration requirements. The repository owner is the decision owner for appointing the operator; `unassigned` must not be accepted at launch. No email/Slack notification has been sent.

## Backup policy and key custody

| Data class | Proposed staging RPO / RTO | Recovery source |
|---|---|---|
| Canonical catalogue, native auth/MFA, rent/audit/LSS, privacy decisions | 24 hours / 4 hours | Daily physical PostgreSQL backup with required WAL and verified manifest |
| Media originals, quarantined bytes, normalized variants, attachment references | Same snapshot / 4 hours | `media_blobs` and related PostgreSQL tables; these are currently the canonical media store |
| Private local notification receipts | Same fenced checkpoint / 4 hours | Private sink archive; preserve idempotency receipts |
| Search indexes and advisory projections | Rebuild / 4 hours | Restored canonical tables; reindex/upsert with current versions |
| Completed privacy exclusions / external financial reconciliation | No silent rollback permitted | Fresh authoritative privacy barrier and external reconciliation before admission |
| Authentication/recovery keys | No loss acceptable | Separate controlled escrow, never the data archive |

The owner has **not approved production RPO/RTO or retention**. Proposed staging retention: seven daily and four weekly immutable encrypted sets; delete only expired sets after confirming a newer verified independent copy. Privacy/legal requirements may change that policy. A second encrypted file on this machine proves copy/decrypt mechanics, not an independent failure domain. Select separate credentials/account/region or an offline protected destination with versioning/retention controls and test retrieval/key recovery there before G5.

### Backup and admission procedure

1. Fence ingress and stop every writer/worker across replicas; check active sessions. Record the checkpoint and in-flight jobs. Quiescence is essential for the separate notification sink and logical authority snapshot. `LONDOS_RECOVERY_FENCED=true` is an explicit operator assertion, **not an automatic lock**.
2. Use the dedicated migration/backup authority, not runtime credentials. On the PostgreSQL 18 container, run `pg_basebackup -U londos_migrator -D <new-private-directory> -X stream -c fast --manifest-checksums=SHA256`, then `pg_verifybackup <directory>`. Never overwrite PGDATA or an earlier backup. Archive the verified cluster and the stopped private notification sink together. The executable [rehearsal](../scripts/release/rehearse.ts) shows exact isolated commands and ownership-checked cleanup.
3. Generate a 32-byte random recovery key once into a private regular mode-0600 file using the secret manager; escrow it independently with recorded custodians and restore instructions. Set `LONDOS_RECOVERY_KEY_FILE` to that file. Encrypt the closed archive with `npm run release:recovery -- seal <archive> <new-encrypted-path>`. AES-256-GCM authenticates the header and entire archive; output publication refuses overwrite. Retain no unprotected plaintext outside the controlled staging work area.
4. Transfer the encrypted set to the selected independent destination, verify its digest, and decrypt/manifest-check a retrieved copy. Wrong keys, tampering and truncation must fail without publishing a plaintext archive. Record receipt, source cluster, schema checksums, ciphertext digest, timestamps, bytes and custody. Remove only the temporary files created by this operation after verification; never run broad Docker/volume pruning.
5. Before recovery, obtain a **fresh current** signed privacy authority from the authoritative fenced cluster or separately maintained trusted exclusion process: `LONDOS_RECOVERY_FENCED=true npm run release:recovery -- capture <new-authority-file>`. Keep it outside the backup set in independent escrow. The current implementation signs cluster/database/schema and privacy history/exclusion digests and accepts at most a 30-minute age. A signature proves authenticity, not freshness after an unobserved erasure. If the authoritative source is lost and no current independent barrier exists, admission is blocked; do not generate the authority from the old restored backup to approve itself. Durable independent exclusion journaling/disaster authorization remains a production prerequisite.
6. Restore to a new isolated cluster/network/volume, not over the original. `npm run release:recovery -- unseal <encrypted> <new-archive>` authenticates before publication. Unpack only a trusted closed archive into the owned empty location, verify PostgreSQL's backup manifest **before startup**, then recover its WAL with PostgreSQL 18. Keep web, workers and public ports disconnected.
7. With `DATABASE_URL` selecting the isolated target and the separately supplied current authority/key, run `LONDOS_RECOVERY_FENCED=true npm run release:recovery -- admit <current-authority-file>`. Identity, schema, privacy digest and completed-erasure effects must match. Older backups that predate erasure are intentionally rejected; this packet does not silently repair, delete immutable history or expose stale personal data. A signed receipt bundled with an old backup cannot establish current admission.
8. Verify tenant denials/native MFA, all canonical counts/digests, immutable rent totals/reversals, LSS history, normalized media bytes, attachment scope and references. Rebuild derived indexes/projections. Reconcile transactions after the checkpoint with the independent payment ledger before any live financial operation. Replay bounded supported pending jobs with their original idempotency keys; preserve delivery receipts. Restore `AUTH_SECRET` from separate escrow or explicitly invalidate sessions and re-enrol affected factors under an approved recovery process.
9. Only after all checks, start compiled web/worker under runtime roles and verify readiness, private cache protection, backlog, delivery idempotency and alert routing. Record elapsed recovery time and the actual unrecoverable interval/records. The P12 fixture restore loses zero checkpoint rows but does not measure production volume or a 24-hour loss event.

`npm run release:rehearse` performs the isolated migration, physical backups, erasure barrier, destructive fictional catalogue fault, restore, replay, runtime-role/health/TLS/rollback checks and cleans up only labelled resources it created. It requires the candidate and compatible R2 images, Docker, OpenSSL and PostgreSQL image; no main database or live provider is used. It writes a new P12 evidence file only after every check passes. Preserve dated prior packets before running future drills.

## Rollback and forward fix

Drain workers and stop writes; identify the exact current/previous image and schema/job contract. For this packet both R2 and P12 use schema 018 and job schema 1. The actual rollback uses R2 source `093d61d31c7c3d46465cbe16d207e2adc336b19f` with the P12 entry/health wrapper, then returns to the candidate, reading newly committed catalogue data and retaining the exact financial-history digest. It does not claim arbitrary future schema downgrade compatibility. Do not reverse migrations or replace durable history to roll back application code. For future incompatible schemas, use an additive forward fix and rehearse its data conversion.

Set `LONDOS_AI_REMOTE=false` and restart every replica to disable paid AI; also keep fallback/auth failover false. The rehearsal confirms zero attempt rows with disabled AI. Set analytics/erasure switches false and restart workers/web to stop those optional effects. There is no invented global rent/publication/provider-callback switch: use existing scoped unpublish/moderation actions, stop workers to stop automatic rent jobs, and block mutation ingress when necessary. Live callbacks/collection are not implemented. Read-only public operation must still enforce current eligibility. Resume only after native scoped review; rent repayment must never lift moderation automatically.

## Incident procedures

| Runbook | Contain, recover and verify | Rehearsal boundary |
|---|---|---|
| Database outage/corruption | Stop writes and alert. Preserve logs and the damaged volume; inspect disk/connection pressure. Reconnect for a service interruption; for corruption restore to a new isolated volume and apply the admission procedure. Confirm readiness plus native reads/writes before reopening. | P12 actual database stop/start, backup manifest/authentication failures, physical restore; deliberate corruption of the main database is not performed |
| Worker backlog | Check own heartbeat, oldest job, lease, attempts and redacted failure code. Restore dependency/capacity; restart with graceful drain. Requeue only supported effects under existing operator authority; never mint new idempotency keys to bypass receipts. | P12 process drain/monitor and restored receipt replay; P4/R2 stale-worker/replay tests |
| Credential compromise | Disable affected remote feature, revoke provider/DB credentials through the owner, rotate distinct secrets and restart affected processes. Revoke native sessions using governed controls; preserve redacted audit. Review AUTH_SECRET/MFA consequences before rotation. Scan artifacts/logs and re-test one bounded provider call. | Invalid OpenAI key detected; existing session/revocation tests pass. Real provider rotation and off-host key custody are owner operations |
| Landlord/merchant takeover | Restrict affected scope, preserve append-only evidence, revoke sessions/memberships via authorized recovery with fresh native MFA and independent reviewer. Confirm tenant boundaries before reinstatement. | Existing native authorization/incident/recovery tests. Lost-all-factor ownership proof remains unimplemented; no improvised admin bypass |
| Malicious upload | Keep raw/quarantine bytes private; reject invalid formats/size, remove publication through scoped media controls and inspect redacted dead jobs. Restore/rebuild only validated owned variants, then recheck eligibility. | Existing real Sharp/upload tenant tests and P12 restored normalized bytes; no live malware scanning service claimed |
| Rent reconciliation | Disable collection/callback ingestion if later configured. Match invoice/reference/currency/amount and external ledger; use scoped manual credit/reversal once with stable idempotency key and fresh MFA. Preserve all history and moderation. | P12 native payment/reversal/repayment and duplicate replay; development UGX 5,000/30 days/seven-day grace only |
| Storage/CDN outage | Preserve text/contact fallback and current eligibility. Restore database media/attachments, verify variants, disable/bypass affected cache and recheck unauthorized paths before reopening. | P11 outage tests; P12 physical media restore and local TLS/no-cache proxy. Real CDN/provider outage remains external |
| Accidental bulk deletion | Fence writers, preserve the original and incident checkpoint, restore privately, compare canonical data, reconcile subsequent business/privacy events, then promote only an admitted recovery. | P12 deletes fictional catalogue in its owned source and recovers exact checkpoint digests into another cluster |
| Privacy breach | Contain affected scope and preserve restricted evidence; appoint legal/privacy lead to assess jurisdiction, notification and subject-access duties. Use governed erasure/holds, independent current exclusions and quarantined restores; do not erase finance/audit to conceal the event. | P12 old-backup exclusion rejection; P9/P11 privacy tests. Full legal response, subject access/account deletion and independent journal remain open |
| DNS/domain compromise | Disable or remove unsafe ingress through the verified owner; recover registrar/DNS/certificate control with MFA, rotate credentials, verify chain/records/origin and protected routes before restoring traffic. | Local verified TLS/config exercise and documented tabletop steps; no owned production domain or registrar recovery claimed |
| Backup restoration | Follow the nine-step procedure above with a second operator, isolated networking, separate key/authority, verified receipt and measured acceptance before admission. | P12 physical WAL/media/native-auth/finance/privacy/replay drill; independent destination and production-scale RPO/RTO remain unproven |

For a live incident, designate an incident commander, database/recovery operator, security/privacy lead and merchant-support owner before launch; maintain an out-of-band contact route. Those people/channels cannot be invented from repository code. Retain the timeline, exact image/schema, approvals and redacted evidence. The repository owner must approve production launch, policy/retention, host/domain/budget and remaining capability decisions after reviewing the concrete dossier.
