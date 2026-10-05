# X1 security contracts and R1 review

This is the implemented development boundary for P2–P4, not a production security certification. X1 used the owner-reported Sol 6.1 Extra High workflow. **R1 review/fixes are complete**, as requested for the 6 Astra Extra High stage. Read [R1 findings](evidence/R1-REVIEW.md), [ADR-0003](ADR/0003-identity-and-durable-jobs.md), [CONTRACTS](CONTRACTS.md), [X1 evidence](evidence/X1-STAGE.md) and the source/tests. Next: owner-confirmed **Sol 6.1 Extra High X2**.

## Assets, threats and controls

| Asset / threat | Current control and evidence | Later obligation |
|---|---|---|
| Sessions: forged cookies, expiry/logout/recovery reuse | Library-signed HttpOnly/SameSite cookies; TLS cookies Secure; database reads with cookie caching disabled; expiry, logout, one-use recovery and session revocation tests | Configure actual HTTPS/trusted edge, recovery support policy, deployment/session key rotation |
| MFA: password-only operator entry, stale factor/password authority | Real TOTP/backup verification; proof binds session, factor and credential generation; password/factor revocation and in-flight reset tests; mandatory operator MFA; five-minute step-up; code reuse rejection | Review library hooks/cookie convention on upgrade, lockout/recovery abuse and operator recovery procedure |
| Tenant records: guessed IDs, nested foreign references, staff escalation | Server-owned actor; current merchant/action/shop grants; tenant-consistent FKs; Merchant A/B positive/negative harness; every current protected domain handler attacked over HTTP | Extend registry for uploads, drafts, previews, exports, search, financial and bulk endpoints as introduced |
| Membership: concurrent last-owner loss, stale invitations/sessions | Merchant lock, deferred owner constraint, immutable identity, email-bound one-use invitation; issuer authority loss revokes outstanding invitations; recipient session/step-up and wall-clock expiry rechecked after lock waits; audit/outbox | Owner recovery and operator authority changes require separately reviewed workflows |
| Private HTML/RSC/cache reuse and referrers | Proxy before rendering plus domain checks; dynamic private no-store/no-referrer; cross-account page/RSC tests; browser recovery request sends no Referer; no private account fields in public rendering | Test CDN/service worker/router caching and newly introduced surfaces |
| CSRF/origin abuse, oversized mutations, concurrent abuse | Exact configured mutation origin; native library origin/CSRF enabled in all modes; bounded recovery callback with external-redirect rejection; bounded JSON reader; atomic DB budgets and lockout | Production edge/network budget and distributed deployment load tests |
| Audit/financial history: edits, rounding, duplicate credits | Append-only triggers; unscaled minor-unit domain rejects fractions/nonfinite/overflow values before storage; currency FK; unique source/reference; pre-shop invoice fixture | P8 implements verified reconciliation/provisioning, period/policy tests and financial state transitions |
| Lost/duplicated/out-of-order jobs | Transactional queue; dedupe; leases/fencing/timeout/backoff/dead letters; effect receipts; canonical version read; forced process deaths and repeated local delivery | Each financial/media/publication handler needs its own consequence/idempotency tests |
| Secrets in browser/assets/logs | No NEXT_PUBLIC secrets; redacted event codes; no job payload API; private ignored account/mail files; verification/reset/MFA details stay in authenticated/local sinks | Production secret manager, storage encryption/retention, scanning and log/export review |
| Local sinks mistaken for live providers | Explicit local flag and loopback origin; worker/auth refuse unconfigured live adapters; readiness reports live delivery/financial operations false | Select/configure/test actual providers before remote pilot |

## Implemented surfaces

The public Mall and Shop still render fictional fixtures. Their flags and search helpers are not a production eligibility engine. PostgreSQL holds independently labeled development data; profile edits do not publish it.

Private pages: `/shopkeeper`, `/shopkeeper/shops/[shopId]`, `/security`, `/landlord`. Account pages: `/sign-in`, `/recover`. The public auth handler is allowlisted; public signup, arbitrary provider paths, trusted devices and passwordless/OTP-only MFA are unavailable. Local bootstrap creates fictional accounts through an explicit guarded CLI; it does not deploy a default administrator password.

Protected domain APIs:

- `GET /api/workspace/shops`, `GET/PATCH /api/workspace/shops/[shopId]`.
- `PUT /api/workspace/merchants/[merchantId]/memberships/[userId]`.
- `POST /api/workspace/merchants/[merchantId]/invitations`, `DELETE .../invitations/[invitationId]`.
- `POST /api/workspace/invitations/accept`.
- `POST /api/workspace/merchants/[merchantId]/ownership`.
- `PUT /api/workspace/merchants/[merchantId]/staff-shops`.
- `GET /api/operator/jobs`, `POST /api/operator/jobs/[jobId]/replay`.

New protected APIs must be added to the HTTP attack fixture and authorized again inside their domain service. A server-internal `Actor` is not a browser-provided role or capability. Scope queries and reject missing resources consistently. Operator permission alone must never substitute for tenant scope in support access.

## Transactions and locks

Membership/invitation/ownership/profile mutations use the merchant row as the shared serialization point. Recheck permissions after acquiring it. Profile updates compare the supplied canonical version and return 409 on conflict. Write audit and durable work in that transaction. The owner constraint is deferred so an atomic transfer can promote its target before completion. Migration locking/checksums apply separately from runtime command transactions.

Read APIs check grants at request time; mutations recheck after their serialization lock. Operations already authorized at their final check are not promised instantaneous retroactive cancellation. Revocation committed before the next access is tested. Future sensitive reads/writes must define their consistency boundary explicitly. Password reset additionally fences requests already verifying old credentials so they cannot establish fresh authority afterward.

## Operational limits that R1 must retain

- Local adapter files and job payloads can contain live-within-development recovery links/tokens. They are private, ignored and excluded from public handlers. Their production retention/encryption/deletion policy remains open; do not expose them through an operator payload viewer or commit them.
- The PostgreSQL development role is privileged for guarded test database creation. Production least-privilege roles, append-history privileges, database TLS and credential rotation must be implemented/tested before release. Row-level security is not enabled or claimed.
- The rate-limit adapter intentionally uses one loopback network identity and ignores spoofable client IP headers. Atomic account/global budgets are tested. Remote deployment needs a trusted ingress and a reviewed network budget; it is currently blocked.
- `GET /api/ready` requires the current named migration and checks configuration, reporting worker state separately. An offline worker permits browsing/authenticated reads; it leaves durable pending work visible. It does not establish provider readiness or backup health.
- The worker can stop waiting at its deadline. A noncooperative future provider may finish later; its idempotency key and lease-fenced canonical effects are still required. Never describe at-least-once work as exactly-once external delivery.
- Automatic rent closure, moderation/approval commands, LSS publication, uploads, guest enquiries, public PostgreSQL discovery and AI remain later phases. Their attack/idempotency/cache/financial tests must be added; these passing foundation tests do not certify unimplemented features.
- This stage tests process/lease recovery. Production backup restoration, disaster recovery, RPO/RTO and safe remote deployment remain P12 requirements.

## R1 completion and future review obligations

R1 inspected the current boundary before widening features and fixed confirmed defects. [R1-REVIEW](evidence/R1-REVIEW.md) records severity, reproductions, affected contracts, fixes, 75 passing tests and migration preservation. No confirmed critical/high finding remains open in this implemented boundary; unimplemented consumers and production controls are not certified by that statement.

Repeat relevant source/contract review for library upgrades and new domain handlers, including MFA recovery, CSRF, budgets, permission matrices, lock-wait revocation, private RSC/cache behavior, SQL integrity/history and consequential job recovery. Do not approve solely because existing tests pass. Preserve unresolved owner policies without inventing live rent/retention rules. Follow [X2-HANDOFF](X2-HANDOFF.md) next; production approval is a separate owner action under prompt.txt.
