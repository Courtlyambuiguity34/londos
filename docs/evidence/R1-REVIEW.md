# R1 security review and verification

Completed: **2026-10-05 UTC**. Reviewed baseline: `c93261f` (X1), on branch `work`. The owner requested the **6 Astra Extra High R1** stage; the assistant cannot inspect or change the model-selector UI. This report records source review, reproduced defects, fixes and local evidence, not a production certification.

## Outcome and scope

R1 is complete for the implemented P2–P4 development boundary. The review found and fixed seven behavioral defects and one test-policy gap. No confirmed critical/high finding remains open within that reviewed boundary. New feature handlers and production integration still require their own evidence.

Reviewed: authentication library hooks and HTTP adapter, password/session/MFA recovery, current permission and tenant checks, private HTML/Flight responses, invitation/ownership races, SQL constraints and money representation, audit/transactional queue, worker leases/replay/deadlines and local delivery. Public catalogue rendering still uses fictional fixtures; media, LSS, live financial commands and AI are not implemented by this review.

## Findings and fixes

Severity reflects the consequence within the implemented local application, not a claim of a deployed exploit. Regressions exercise real PostgreSQL and the pinned authentication library.

| ID / severity | Reproduction and consequence | Fix and verification |
|---|---|---|
| R1-01 **High**: stale factor authority | With two MFA-authenticated sessions, remove/re-enroll the factor in one session. The other session's old proof still authorized step-up before the fix. | Migration 007 binds proofs to factor identity and a credential generation (`auth_epoch`). Removing a factor revokes sessions/challenges/proofs; replacing a verified secret in place is rejected. Actual enrollment/replacement regression and SQL overwrite rejection pass. |
| R1-02 **High**: recovery did not invalidate pending MFA | Create a password-authenticated MFA challenge, reset the password, then complete the old challenge with an unused backup code: the baseline issued a new authenticated session. Requests already verifying an old password/factor also need a defined reset boundary. | Password updates rotate the generation and transactionally revoke sessions/challenges/proofs. Before/after library hooks compare the observed generation; rejected authentication never sends prepared session cookies. Tests cover an old pending challenge and deterministic resets during native password verification and during MFA session creation. Both in-flight cases return 401 without usable new authority. |
| R1-03 **High**: former owner invitations retained authority | An invitation issued by an owner could grant ownership after that owner was removed, demoted, or transferred ownership. All three variants reproduced before the fix. | A membership trigger revokes that issuer's unaccepted invitations atomically when active-owner authority is lost. Restoring the issuer's role cannot revive those invitations. Three transition regressions pass; accepted memberships are unaffected. |
| R1-04 **Medium**: invitation authorization outlived a lock wait | Invitation acceptance checked the session before waiting for the merchant lock. Logging out during the wait still allowed membership creation. Transaction-start `now()` could likewise accept expiry during the wait. | Recheck session and step-up after acquiring the lock; compare session/invitation expiry against `clock_timestamp()`. Bounded tests observe a real PostgreSQL lock wait, then revoke the session or expire the session/invitation. No membership is created. |
| R1-05 **Medium**: fractional minor units rounded silently | `numeric(20,0)` coerced `100.5` to an integer before constraints could reject it. Baseline product/invoice inserts reproduced this; rent used the same coercing type. | An unscaled `minor_units` domain rejects fractions and values outside the signed 20-digit range before storage. Tests cover products, invoices and rent events, including negative fractions, overflow, NaN and infinities. Existing sign/currency/history constraints remain. An initial rent reproduction had a parameter-type error; the corrected regression covers it. |
| R1-06 **Medium**: password recovery link was inaccessible | The maintained library generated `/api/auth/reset-password/:token`, but the application allowlist rejected the actual notification URL with 404. | Allow only the bounded GET callback shape and retain library callback-origin validation. Integration checks its redirect and rejects an external callback; a production browser follows the notification link, resets the password and signs in with the new password. |
| R1-07 **Medium**: private referrer policy overwritten | The later global Next header rule overwrote private `no-referrer`, including token-bearing recovery pages. Actual responses returned `strict-origin-when-cross-origin`. | Apply general headers before specific private headers. Production browsers check private no-store/no-referrer responses and confirm a request from the recovery page sends no Referer header. |
| R1-08 **Verification gap**: test-only origin bypass | Better Auth's default under `NODE_ENV=test` skipped origin validation, so a new external callback test redirected rather than failing. This was not evidence of a production open redirect. | Explicitly enable library origin and CSRF checks in every mode. The real library integration and production HTTP tests reject the external callback with 403. |

Supporting readiness change: require the deployed code's named migration, `007_r1_security_contracts.sql`, instead of counting migration rows. A production browser-suite HTTP check substitutes another name in its isolated database, proves readiness returns 503, restores the name, and proves recovery to 200.

Affected source: [authentication hooks](../../src/server/security/auth.ts), [HTTP adapter](../../src/server/security/auth-http.ts), [session authorization](../../src/server/security/authorization.ts), [invitations](../../src/server/security/memberships.ts), [migration 007](../../migrations/007_r1_security_contracts.sql), [response headers](../../next.config.ts) and [readiness](../../src/server/readiness.ts). Reproductions and regressions are in [integration tests](../../tests/integration/core.test.ts) and [production browser tests](../../tests/e2e-core/security.spec.ts).

## Implementation contracts

- Better Auth remains responsible for password hashing, signed cookies, verification, TOTP and backup-code consumption. Application hooks observe server-side identity and credential generation; they do not implement substitute cryptographic verification. Their use of the pinned library's signed `two_factor` challenge cookie/adapter is an explicit upgrade-test obligation.
- Credential/factor invalidation is in PostgreSQL triggers so the password update and revocation commit together. Current-session authorization only accepts a proof for the current generation. Existing factor/session foreign keys prevent a proof from surviving removal of its parent.
- Invitation issuance and membership mutations serialize on the merchant. Owner-authority loss revokes outstanding invitations in that transaction. Acceptance rechecks the recipient after its lock wait, using current wall-clock expiry. A domain command already authorized at its final check is not promised retroactive cancellation.
- MFA factor removal revokes sessions. Password change/reset also revokes preceding sessions and pending challenges. A newly created session after a native password-change flow may require a fresh MFA challenge. Operator factor disable remains unavailable through the HTTP adapter.
- Migration 007 deliberately deletes transient old MFA proofs because their factor generation cannot be recovered safely. Users and otherwise valid sessions survive migration, but MFA-enrolled sessions must challenge again. Migrations 001–006 are unchanged.

## Verification

| Check | Result |
|---|---|
| Lint, strict types and documentation links (`npm run check`) | Passed |
| Unit tests | **15 passed** |
| Real PostgreSQL integration tests | **39 passed**: original 26 plus 13 R1 cases |
| Production public browser tests | **16 passed** |
| Production private/core browser tests | **5 passed**: original four plus recovery/header/schema-readiness flow |
| Formatting | Passed |
| Production Next standalone and independent worker build | Passed |
| Full dependency audit | **0 vulnerabilities** |
| Configured-secret artifact scan | Passed: **419 files**, **8 configured candidate values**, no values printed |
| Existing development-volume migration and repeat seed | Passed; see [migration evidence](R1-MIGRATION.json) |
| Restarted local web and worker | Readiness 200; database/authentication true and worker ready; live notifications/financial operations false |

Total: **75 passing tests**. The original cross-tenant HTTP attacks, private HTML/Flight denials, ownership races, transaction rollback, separate-process crash recovery, stale-lease rejection and duplicate delivery checks remain passing. Source review found no additional confirmed queue defect within the current handlers; this is not evidence for future media/financial effects.

Two browser-test corrections were necessary while adding the new flow: the recovery field is labeled “Account email,” and Playwright's provisional request headers contain an empty `referer` field even when the final network request omits it. The final assertion uses `request.allHeaders()` and verifies actual header absence. No application defense or test was disabled to obtain the pass. The library test-mode origin gap above was fixed explicitly.

The database upgrade took **1,193 ms** on the existing local volume. Row counts and canonical row fingerprints were unchanged for **1,506 shops, 150,004 products, zero invoices and zero rent events**. Repeating migration and seed preserved them and the private credential file. Integration fixtures additionally cover existing identity/session/MFA records and old-proof invalidation. Empty local financial tables do not establish financial-history restoration; fixture checks cover representation and constraints only.

## Operation and remaining gates

Stop old web/worker processes for this development upgrade, migrate, then run the matching new build. The money type conversion can rewrite/lock tables; the local timing is not a production downtime estimate. Never edit an applied migration or roll back just the code across this contract change. A production upgrade needs a backup/restore rehearsal and a reviewed roll-forward plan.

Read [X1 evidence](X1-STAGE.md) for the earlier outage/restart drills and provider limitations. R1 does not repeat or relabel them as disaster restoration. Production DB least privilege/TLS, secret rotation, recovery support, trusted ingress budgets, broader browser policy hardening, backup restoration, retention and deployment supervision remain P11/P12 gates. Live rent amounts/grace/closure rules remain owner policy. Remote CI execution, publishing the cloud draft, fresh-task restoration, Docker-volume persistence and restoration of local-only commits remain unverified.

No remote push or deployment was performed. The reusable cloud startup instructions are saved as a draft for environment-settings review/save and publication; draft persistence does not apply that configuration.

## Next model handoff

Switch to **Sol 6.1 Extra High** and confirm **“Continue X2.”** [X2-HANDOFF](../X2-HANDOFF.md) defines the first P5 catalogue/media work packet and its gates. This work introduces protected commands, concurrent updates, sensitive contact changes and media security, so it requires Extra High before ordinary UI can safely consume those interfaces. Use High for later routine interface work when a handoff identifies a bounded task; return to Astra Extra High for R2 or an unresolved critical architecture decision.
