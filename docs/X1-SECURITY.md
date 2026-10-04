# X1 security contracts and R1 review

This is the implemented development boundary for P2–P4, not a production security certification. The owner reported Sol 6.1 Extra High for X1. The next required setting is **6 Astra Extra High**, stage R1. Read [ADR-0003](ADR/0003-identity-and-durable-jobs.md), [CONTRACTS](CONTRACTS.md), [evidence](evidence/X1-STAGE.md) and the source/tests before approving dependent features.

## Assets, threats and controls

| Asset / threat | Current control and evidence | Later obligation |
|---|---|---|
| Sessions: forged cookies, expiry/logout/recovery reuse | Library-signed HttpOnly/SameSite cookies; TLS cookies Secure; database reads with cookie caching disabled; expiry, logout, one-use recovery and session revocation tests | Configure actual HTTPS/trusted edge, recovery support policy, deployment/session key rotation |
| MFA: password-only operator entry, enrollment flag mistaken for challenge proof | Real TOTP/backup challenge; session-bound proof only after success; rotated-session coverage; mandatory operator MFA; five-minute step-up; TOTP receipt/recovery-code reuse tests | Review library upgrades, lockout/recovery abuse, operator recovery procedure and manual device UX |
| Tenant records: guessed IDs, nested foreign references, staff escalation | Server-owned actor; current merchant/action/shop grants; tenant-consistent FKs; Merchant A/B positive/negative harness; every current protected domain handler attacked over HTTP | Extend registry for uploads, drafts, previews, exports, search, financial and bulk endpoints as introduced |
| Membership: concurrent last-owner loss, stolen invitations, old session access | Merchant lock, deferred owner constraint, immutable membership identity, hashed email-bound expiring one-use invitation, ownership transfer, live grant checks, audit/outbox | Owner recovery and operator authority changes require separately reviewed workflows |
| Private HTML/RSC/cache reuse | Proxy before rendering plus domain checks; dynamic routes; private no-store; cross-account page/RSC tests; no private account fields in public rendering | Test CDN/service worker/router caching and newly introduced surfaces |
| CSRF/origin abuse, oversized mutations, concurrent abuse | Exact configured origin for POST/PATCH/PUT/DELETE; native library controls; bounded JSON reader; atomic DB budgets; factor/account lockout configuration | Production edge/network budget and distributed deployment load tests |
| Audit/financial history: edits, float rounding, duplicate credits | Append-only triggers; exact integer decimal money/currency FK; unique source/reference; pre-shop invoice fixture | P8 implements verified reconciliation/provisioning, period/policy tests and financial state transitions |
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

Read APIs check grants at request time. Already-authorized in-flight reads are not a promise of instantaneous retroactive cancellation. Revocation committed before the next access is tested. Future sensitive reads/writes must define their consistency boundary explicitly.

## Operational limits that R1 must retain

- Local adapter files and job payloads can contain live-within-development recovery links/tokens. They are private, ignored and excluded from public handlers. Their production retention/encryption/deletion policy remains open; do not expose them through an operator payload viewer or commit them.
- The PostgreSQL development role is privileged for guarded test database creation. Production least-privilege roles, append-history privileges, database TLS and credential rotation must be implemented/tested before release. Row-level security is not enabled or claimed.
- The rate-limit adapter intentionally uses one loopback network identity and ignores spoofable client IP headers. Atomic account/global budgets are tested. Remote deployment needs a trusted ingress and a reviewed network budget; it is currently blocked.
- `GET /api/ready` checks database schema/configuration and reports worker state separately. An offline worker permits browsing/authenticated reads; it leaves durable pending work visible. It does not establish provider readiness or backup health.
- The worker can stop waiting at its deadline. A noncooperative future provider may finish later; its idempotency key and lease-fenced canonical effects are still required. Never describe at-least-once work as exactly-once external delivery.
- Automatic rent closure, moderation/approval commands, LSS publication, uploads, guest enquiries, public PostgreSQL discovery and AI remain later phases. Their attack/idempotency/cache/financial tests must be added; these passing foundation tests do not certify unimplemented features.
- This stage tests process/lease recovery. Production backup restoration, disaster recovery, RPO/RTO and safe remote deployment remain P12 requirements.

## R1 execution and acceptance

After the owner confirms **6 Astra Extra High**, inspect this exact boundary without broadening features first. Re-run the relevant documented checks against real PostgreSQL. Review library adapter hooks and failure paths, MFA enrollment/challenge/session rotation/replay/recovery, CSRF and account enumeration/rate-limit behavior, permission matrices, invitation/owner races, private RSC/cache denial, SQL integrity/history, queue fencing/replay/timeout and redacted logs.

Record concrete findings with severity, reproduction, affected source, fix and verification. Fix security defects in scope and test them; do not approve merely because existing tests pass. Review state contracts and explicitly unresolved owner policies without inventing live rent/retention rules. Produce `docs/evidence/R1-REVIEW.md`, update BUILD-STATUS and identify the next H2/X2 model boundary. Production approval is a separate owner action under prompt.txt.
