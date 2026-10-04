# X1 — Sol 6.1 Extra High security foundation evidence

Completed: 2026-10-05 (Africa/Kampala). Instrumented run timestamps are UTC. Setting confirmed by the owner: “I’ve switched to Extra High. Continue X1.” The assistant cannot inspect or change the model-selector UI. Work continues on the existing `work` branch, following High-stage parent `e65748e` and the owner's staged [recommendations](../../RECOMMENDATIONS.md).

## Result and scope

The initial local security/persistence/job boundary is implemented: pinned real PostgreSQL, additive migrations, safe fictional seed, synthetic generator, maintained password/session/MFA library, current-session proof, explicit merchant/action/shop/operator grants, protected profile/workspace APIs, invitation/ownership safeguards, append audit, transactional queue, independent compiled Node worker/scheduler, local adapter interfaces, health/readiness and regression tests.

Public browsing still uses labeled fictional fixtures. The private database seed is also fictional. This is not a complete merchant product or production-ready release: live delivery, production roles/recovery, catalogue/media commands, LSS publication, verified rent, PostgreSQL public search and AI remain later phases. Full feature schemas evolve as those domains are introduced; the checklist retains their open tasks. No production deployment or remote push was performed.

## Verification

| Check | Local result | Practical limit |
|---|---|---|
| Strict lint/types, public unit tests, documentation links, formatting | Passed; 15 unit tests | Public fixture tests alone do not establish tenant security |
| Real PostgreSQL integration suite | **26 passed**, no failed/skipped tests | Initial infrastructure/current protected domains only |
| Production public browsers | **16 passed**, desktop and mobile | Labeled public fixtures, no production data |
| Production private browsers | **4 passed**, desktop and mobile | Initial sign-in/profile/security/operator surfaces |
| Production web and independent worker build | Passed | Deployment supervision and live providers not configured |
| Frozen setup/migrations/repeated seed | Passed | Existing local environment; fresh-task restoration unverified |
| Full development/runtime dependency audit | **0 vulnerabilities** | Audit is not a complete security review |
| Configured-secret artifact scan | Passed; values not printed | Exact configured values only, not general secret discovery |
| Synthetic generator target and repeat | **1,500 shops / 150,000 products**, same seed twice | Dataset capacity, not search/load/latency evidence |
| Runtime worker outage/restart and DB outage/readiness | Recorded in [runtime evidence](X1-RUNTIME.json) | Process/queue recovery, not backup/disaster restoration |

Current test evidence lives in `tests/unit`, `tests/integration`, `tests/e2e` and `tests/e2e-core`. The CI workflow includes the public checks and a real PostgreSQL security/browser job. GitHub Actions execution remains unverified. Browser reports/traces and local credentials/data are ignored, not committed.

The live recovery check committed two profile changes while the worker was stopped. Restart completed both effects, left zero outstanding profile jobs and brought the projection to canonical version 3. Stopping PostgreSQL returned 503 for readiness and authenticated pages/APIs while public home/search and liveness stayed at 200. The web process survived; database restart restored authenticated reads, and the restarted worker reported ready. No volume was deleted.

## Visual evidence

Captured from the production build on the local fictional development database, after recovery. The screenshots were visually inspected; passwords, authenticator secrets and recovery codes are absent.

- [Desktop private shop profile](../illustrations/x1-shopkeeper-desktop.png), 1440 px viewport.
- [Mobile account security](../illustrations/x1-security-mobile.png), 390 px viewport, before enrollment.

## What the integration assertions cover

- Fresh schema, upgrade from an older identity fixture, repeated/concurrent migration, checksum tamper rejection and preservation of data.
- Foreign department/product/media/revision/invoice rejection; immutable shop identity; exact 20-digit money; invoice before shop; append-only financial/audit history; concurrent unique-slug allocation.
- Nonlocal/unknown database guard; repeated seed preserving credentials and canonical edits.
- Owner and restricted staff permissions, per-shop scopes, Merchant A/B guessed-ID reads/writes, operator action/resource separation, stale membership denial.
- Profile compare-and-swap with one winning transaction and matching audit/job; role changes, invitation email/expiry/revocation/one use, atomic ownership transfer, concurrent last-owner protection and independent DB constraint.
- Unverified email denial and working verification; generic invalid-account errors; exact-origin rejection; hidden signup/trusted-device restrictions; concurrent atomic request budgets.
- Actual RFC-compatible TOTP setup, rotated-session MFA proof, operator mandatory MFA, step-up freshness, TOTP reuse denial, challenge without full session, invalid code, one-use backup recovery, session expiry/logout and one-use password reset revoking sessions; Secure/HttpOnly/SameSite cookies under TLS configuration.
- Transaction rollback, commit-before-dispatch, duplicate enqueue, expired/stale lease fencing, repeated effect/delivery, separate producer/worker `SIGKILL` at durable checkpoints, canonical version ordering, bounded deadline/cancellation, tenant backpressure, poison/dead letters, fresh-MFA operator replay and overlapping scheduler ticks.

Browser assertions additionally attack **every current protected domain handler**, test private HTML and Flight/RSC denial without shop data, keep account data out of public rendering, reject cross-origin/oversized profile writes, enroll and challenge operator MFA through the interface, save profiles and scan current account surfaces for WCAG A/AA violations and mobile overflow. This does not cover future uploads/exports/design/rent handlers before they exist.

## Defects found and corrected during X1

1. Initial development database startup returned before readiness. Setup now waits for `pg_isready` and reports failure explicitly.
2. The MFA enrollment endpoint rotated the session but returned the preceding session token. The adapter now uses the library's rotated session and records its proof transactionally. The positive/negative tests exercise enrollment and subsequent challenge separately.
3. Next.js private Flight rendering returned HTTP 200 on an unauthorized resource despite an empty private payload. Pre-render Node proxy authorization now returns the actual denial status, while domain/handler checks remain in place. The original status assertion passes.
4. Parallel browser runners collided in a shared artifact directory. Their output/report directories are now separate; the corrected runs passed. No assertion was weakened or test skipped.
5. The first `tsx` selection pulled an affected low-severity esbuild release. Current pinned tooling uses the patched release; full audit is clean.
6. A worker waiting on an unresponsive future adapter needed an explicit deadline race, in addition to cooperative cancellation. The deadline is bounded and tested; idempotency/lease fencing remain necessary for late provider completion.
7. Idle PostgreSQL connection loss must not crash public fixture serving. The shared pool handles that event with a redacted code, while active operations fail closed. Runtime evidence records database-outage behavior.
8. Authenticator-secret retrieval and session management also require fresh authentication. A password-only session retained from before MFA enrollment cannot retrieve the enrolled factor or revoke protected sessions; the regression assertions pass.

## Data, provider and environment status

The verified PostgreSQL image reports **18.6 (Debian 18.6-1.pgdg13+2)** and is pinned by digest. The full synthetic dataset and aggregate-only evidence are in [X1-SYNTHETIC](X1-SYNTHETIC.json); records are not committed.

Local account/password files, session secrets and notification recovery links have private filesystem permissions and are ignored. The local sink does not prove real email/SMS/object-storage capability. Auth/worker initialization refuses a remote/unconfigured live adapter. Financial operations and live notifications remain false in readiness.

Cloud setup/start instructions are saved as a configuration **draft**. Saving does not publish/apply the environment. Review/save that draft in environment settings and publish to activate it; new-task restoration, Docker volume persistence and local-only commit restoration have not been independently verified. No credential values were placed in the draft, and existing repository/network/credential settings were preserved.

## Next model boundary

**X1 secure foundation work is complete. Switch to 6 Astra Extra High and say “Continue R1.”** Review [X1-SECURITY](../X1-SECURITY.md) and [ADR-0003](../ADR/0003-identity-and-durable-jobs.md), reproduce meaningful tests, fix findings and record the review before widening protected feature consumers. Production deployment still requires the owner's separate explicit authorization.
