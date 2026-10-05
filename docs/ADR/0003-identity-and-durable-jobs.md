# ADR-0003: identity, tenant authorization and durable jobs

- Status: implemented in X1; reviewed and corrected in R1 for the current local boundary, 2026-10-05. See [R1 findings](../evidence/R1-REVIEW.md).
- Date: 2026-10-04.
- Builds on [ADR-0002](0002-nextjs-node-application-architecture.md).

## Persistence

PostgreSQL 18.6 was verified from the running official image. Local setup and CI pin its multi-platform image digest `sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722`. The driver is `pg` 8.23.1. Typed, parameterized SQL keeps tenant constraints, locks and financial precision visible. An ORM is not necessary for this initial boundary.

Checked-in, additive SQL migrations run explicitly, under an advisory lock and one transaction per migration. SHA-256 checksums reject edits to applied files. Identity SQL was generated from the pinned authentication options, reviewed and committed; schema auto-migration never runs at web/worker startup. Future library upgrades require a new reviewed migration and upgrade tests.

Composite shop/merchant and department/shop/merchant foreign keys reject invalid references. Separate application, publication, tenancy and moderation records preserve state independence. UUID shop identities and membership identities are immutable. Slugs are unique; aliases/reassignment/provisioning commands belong to P8. Money uses the unscaled numeric `minor_units` domain, returned as strings, with ISO currency and currency-specific interpretation (UGX uses zero decimal places). Its constraint rejects fractions, nonfinite values and values outside the signed 20-digit range before storage; `numeric(20,0)` would silently round before a check. Financial adjustments append events; the application does not collect or reconcile rent yet.

Migration 007 preserves canonical records but invalidates transient old MFA proofs, which cannot safely be assigned to a factor generation retroactively. Deploy the matching code/schema together after stopping old local web/worker processes; the money conversion can rewrite/lock tables. Readiness requires the current named migration. A production migration needs its own backup/restore rehearsal and roll-forward plan; local preservation is not disaster recovery.

## Authentication and permissions

Better Auth 1.7.7 owns password hashing, signed cookies, session lifecycle, verification/reset tokens, encrypted TOTP secrets and single-use recovery codes. Its declared peers accept the pinned Next/React versions. Enrollment, challenge, recovery, revocation and secure-cookie behavior were tested, including an independent RFC-compatible authenticator (`otplib`, test-only).

The HTTP adapter exposes a deliberate endpoint allowlist, including the bounded GET password-reset callback, validates mutation origins, bounds JSON bodies, rejects trusted-device/passwordless MFA options and adds atomic PostgreSQL account/request budgets. Library origin/CSRF checks are explicitly enabled even in tests. Cookie caching is disabled. Server policies recheck the session, verified email, current membership/action grant and actual resource tenant. Staff also require explicit shop grants. Operators use separate action grants, scoped support/review references and mandatory current-session MFA proof; owners cannot become operators through membership APIs.

Only successful library factor verification creates an auditable session proof. Enrollment can rotate the session; the proof follows that rotation. A short-lived hashed TOTP receipt prevents the same code from authorizing another session. Sensitive operations require a proof or password-authenticated session no older than five minutes. Existing password-only sessions of an MFA-enrolled account cannot access domain records. Operator MFA cannot be disabled through the HTTP adapter. Factor-secret retrieval, backup regeneration, password changes and session-management operations also require fresh authentication; stale password-only sessions cannot recover an enrolled factor.

Proofs bind to the factor identity and current credential generation (`auth_epoch`). Password changes and factor removal atomically rotate that generation and revoke sessions, proofs and pending challenges. Hooks observe the server-side generation before native password/factor verification and reject stale completion afterward, including a reset racing with new-session creation. Failed HTTP authentication never delivers prepared session cookies. The pinned library's signed challenge-cookie/adapter convention is part of the upgrade-test contract. Verified factors cannot be overwritten in place; explicit removal is required.

Ownership changes serialize on the merchant record, retain an active owner and audit the mutation. Database constraints independently reject the last-owner removal and identity changes. Invitations bind a hashed random bearer token to a verified email, expiry and one use; they cannot silently replace an existing membership. Staff permissions and per-shop grants can only be assigned by an authorized, freshly authenticated owner.

Losing active-owner authority permanently revokes that issuer's unaccepted invitations in the same transaction, including transfer/demotion/removal. Acceptance rechecks recipient authentication after acquiring the merchant lock. Session and invitation expiry use current wall-clock time rather than transaction-start time. Commands already authorized at their final check are not promised retroactive cancellation.

Private responses are dynamic, `private, no-store` and `no-referrer`; specific private header rules follow general defaults so they take precedence. Node proxy authorization runs before private HTML/Flight streaming and complements handler/domain checks. This preserves true denial status for guessed private URLs. Public fixture rendering has no account-dependent data.

## Durable work

Use one PostgreSQL job table as the transactional outbox and queue. Domain changes, audit and enqueue commit together. This removes a dispatch gap and avoids adding Redis while one database meets the current operational needs. A separately built Node process polls it and owns the scheduler; no job relies on the web process remaining alive.

Delivery is **at least once**. Unique dedupe keys, lease tokens, `SKIP LOCKED`, heartbeat, bounded timeout, five default attempts, exponential backoff, dead letters and per-merchant running-job limits provide the initial controls. Internal effects commit with a unique job receipt and current lease fence. Profile projection jobs read current canonical values and cannot roll versions backward. This projection is internal, not the public search index.

The initial worker is intentionally small; future handlers must use these contracts. External side effects require provider idempotency and cancellation support. The local notification sink atomically links a complete private file, validates repeat content and uses the durable job ID as its key. Test drivers kill separate processes at commit/effect/delivery boundaries and verify recovery. Scheduler ticks deduplicate across overlapping workers. Replay requires explicit operator job permission and fresh MFA, and is audited; immutable payload/schema contracts cannot be edited through replay.

## Limits and review

X1 provides local development infrastructure. Live notification/storage providers, remote identity operation, production DB roles, backup/restore, release supervision and production rate-limit proxy policy are not enabled. Authentication/worker initialization fails rather than silently substituting local delivery at a remote origin. The local DB role can create isolated test databases; it is unsuitable as a production service role.

Read [reviewed security contracts](../X1-SECURITY.md), [X1 evidence](../evidence/X1-STAGE.md) and [R1 findings/verification](../evidence/R1-REVIEW.md). R1 is complete for this boundary. Next: owner-confirmed **Sol 6.1 Extra High X2**, following [the handoff](../X2-HANDOFF.md) and extending security evidence for every new protected feature.
