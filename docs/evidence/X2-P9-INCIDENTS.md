# X2 P9: assigned incidents and owner-confirmed recovery

Verified 2026-10-05, Africa/Kampala, on `codex/londos-x2-2026-10-05`, using the owner-reported **Sol 6.1 Extra High**. Baseline: `bc8b0aac08a77d70f3109ca4e204ac2b5d6ca14e`, the completed local trust packet. This packet completes the local authenticated-owner scope of P9.3/P9.4; it does not complete all P9 or authorize live identity adjudication. [ADR-0009](../ADR/0009-local-incidents-and-owner-confirmed-recovery.md) records the contracts. The packet commit contains this report, migration, implementation, tests and inspected captures together; use Git for its exact SHA.

## Result and boundaries

Fresh current owners can open bounded, idempotent security, account-recovery, contact/payment-instruction, fraud, payment-exception, verification and support incidents. Queue grants filter by kind, expose minimal metadata and prioritize escalated cases, priority and age. Reasoned versioned claims assign one responsible reviewer and a distinct incident scope. Native fresh MFA, current assignment, scope and no merchant self-membership guard private investigation. Escalation releases the assignment and all incident scopes for a qualified re-claim; resolution/cancellation retains immutable history. Separate private notes and owner-facing explanations prevent investigation disclosure.

An assigned recovery reviewer can contain the reporting active owner's sessions once per eligible incident. Existing R1 credential-generation revocation invalidates sessions, proofs and pending MFA challenges; outstanding native reset tokens are deleted and restoration approval cleared. Passwords, email, factors, membership and future native sign-in remain unchanged. Native password reset/change and existing one-use MFA recovery codes remain the credential mechanisms. This is an authenticated-owner incident workflow: lost-all-factor/email/ownership adjudication still requires an approved proof policy and has no operator bypass.

Contact recovery uses the exact immutable earlier snapshot selected by the original reporter. That same currently active owner must freshly confirm the case/contact versions and displayed snapshot. Approval lasts 30 minutes and binds credential generation. The assigned recovery operator rechecks authority and approval after merchant and reporter-user locks, validates the snapshot with today's contact schema, and restores it as a new version. Expiry, changed contacts, password/factor generation changes or owner revocation require renewed confirmation. No operator-supplied replacement fields are accepted. Rent, ledger, publication, moderation, operations, mall placement and ownership remain independent.

The previous direct operator contact-update fallback is removed. Even a legacy recovery/shop scope receives 404 on that endpoint. The existing P5 integration case now verifies this stronger denial while retaining scoped support reads and native MFA checks. Ordinary support can manage support cases and cannot contain sessions or restore contacts. Fraud/finance/verification triage does not substitute for separately claimed trust/application/finance authority.

## Verification

| Check                                                                         | Result                                                                                                                                    |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                               | Lint, generated route types, strict TypeScript, 23 unit tests and documentation links passed.                                             |
| `npm run test:integration`                                                    | **136 passed** across six files against real PostgreSQL, including 16 new incident cases.                                                 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`      | **16 passed** for the existing public fixture preview.                                                                                    |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core` | **24 passed** against compiled production web/worker and an isolated canonical database, including three new incident browser cases.      |
| `npm run build`                                                               | Standalone web and independent worker built successfully.                                                                                 |
| `npm run format:check` / documentation links / `git diff --check`             | Passed.                                                                                                                                   |
| `npm audit --audit-level=high`                                                | **0 vulnerabilities**; dependency declarations and lockfile unchanged.                                                                    |
| `npm run check:bundle-secrets`                                                | **1,354 artifact files / 9 known configured candidate values**, no match; values never printed. Exact-value scanning is bounded evidence. |

Total: **199 passing tests = 23 unit + 136 integration + 16 fixture browser + 24 core browser**. Historical packet counts/evidence are preserved.

Integration coverage includes:

- Nonempty schema-012 contact backfill, immutable snapshots/case identity/events, and rejection of same-version contact rewriting.
- Two merchants, staff/support denial, strict forged fields, original-reporter derivation, all seven grant-filtered queue kinds, anti-self-investigation and independent scopes.
- Concurrent idempotent intake, competing claims and competing restorations; changed retry payloads conflict, and one canonical restoration/notification wins.
- Private note redaction, priority/escalation, assignment release and qualified re-claim.
- Original-owner confirmation, expiry, changed contact revision, password-generation invalidation, native reauthentication and exact new-version restoration preserving intervening history.
- Proven merchant-lock waits with scope/grant revocation, native MFA aging and membership revocation; a proven reporter-user lock wait with credential rotation denies restoration without canonical/history side effects.
- Native containment revokes real sessions and an outstanding reset token. An old-password sign-in paused inside real password verification cannot establish authority after rotation; a previously issued reset token is refused. This does not claim retroactive cancellation of a reset/command that already passed its final authorization check.
- Minimal strict notification payloads, append-only audit and unchanged sensitive canonical states during support resolution, cancellation and recovery.

Browser coverage exercises the complete native owner/reviewer journey: real MFA claim, denied pre-confirmation restoration, containment of two owner sessions, real owner sign-in, fresh exact confirmation, restoration and redacted history. Script-like fictional report content renders as text and does not execute. All eight new protected methods deny anonymous and foreign actors with representative valid mutation bodies; private HTML/Flight and referrer/cache headers, cross-origin requests, forged fields and oversized payloads are checked. Axe, keyboard focus and mobile overflow checks pass.

Two test corrections were required before the clean runs. An integration fixture held a merchant lock while a second connection attempted a membership update whose trigger needed the same lock; performing that deliberate revocation in the already-held transaction corrected the test deadlock. One positively identified unused orphan fixture database was removed with guards and no forced disconnects. The first browser attack registry used empty POST bodies and received schema errors before authorization; valid representative bodies now reach the intended authorization checks. Assertions were retained. The clean integration and complete core browser suites both passed afterward.

## Upgrade and current runtime

[Migration evidence](X2-P9-INCIDENT-MIGRATION.json) records schema **012→013**, **101 ms** locally, with whole-row digests/counts over original columns in **36 existing tables** unchanged. Repeated migration/seed and configuration, application credentials and independent reviewer credentials were preserved. The main fictional dataset remains 1,506 shops / 150,004 products / 1,504 departments / one design revision. Main contacts were empty, so the nonempty backfill is established by the isolated integration fixture, not by the main upgrade. Four new incident/history tables are additive. Applied migrations 001–012 remain unchanged; 013 is now applied and must also remain frozen.

[Runtime evidence](X2-P9-INCIDENT-RUNTIME.json) records matching schema-013 web/independent worker readiness, native authentication/database readiness, public shop/report requests and private anonymous incident denials. Explicit repeatable `npm run db:incidents` grants recovery/support only to the verified fictional operator; ordinary seed grants and private configuration/accounts are unchanged. Native MFA and case assignment remain required. Live collection and notifications remain disabled. Existing owned web/worker processes were stopped before migration and restarted with matching code; unknown processes/data were preserved.

These observations prove the current local runtime and logical upgrade preservation. They do not prove production downtime, backup/restore, fresh-task restoration or Docker volume persistence. Setup and runbook instructions are in [DEVELOPMENT](../DEVELOPMENT.md) and [FAILURE-RECOVERY](../FAILURE-RECOVERY.md).

## Inspected captures

All three captures were opened and visually inspected. They show fictional data, no passwords, factor codes or live credentials, and bounded layouts. Historical captures regenerated by regression tests were restored from the baseline rather than replacing finished evidence.

- [Assigned reviewer and exact historical snapshot](images/x2-p9-incident-review-desktop.png).
- [Owner's resolved incident and redacted history](images/x2-p9-incident-owner-desktop.png).
- [Mobile incident form and visible keyboard focus](images/x2-p9-incident-mobile.png).

[Illustrations](../ILLUSTRATIONS.md) include queue assignment/escalation and owner-confirmed restoration diagrams.

## Remaining work

Continue P9.5–P9.9 privacy-minimized pilot events, direct/discovery attribution, tenant aggregates, governed retention/export/deletion and measurable resource/support costs at **Sol 6.1 Extra High**. Live escalation ownership/response targets, lost-all-factor identity proof, legal retention and provider/support policy remain explicit gates. History before the captured contact baseline is unavailable; latest-20 selection/history views are bounded and do not claim full historic navigation. Incidents contain no new upload/identity-evidence path. Production recovery, least-privilege roles and R2 Astra Extra High review remain later gates. The application and production release remain in progress.
