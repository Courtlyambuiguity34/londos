# Londos build status and model handoff

Updated: **2026-10-05 UTC**. Branch: `work`, the existing isolated task branch.

## Current stage

**R1 — security review and fixes: COMPLETE and locally verified.** The owner requested “Continue R1” for the recorded **6 Astra Extra High** stage. The assistant cannot verify/change the model-selector UI. H was committed as `e65748e`; X1 as `c93261f`. R1 reviews and strengthens that existing foundation.

Fixed: stale MFA authority after factor replacement; pending/in-flight authentication surviving password reset; invitations retaining former-owner authority; expiry/logout during lock waits; fractional minor-unit rounding; broken recovery links; overwritten private referrer policy; and library origin checks bypassed by its test-mode default. Readiness now requires the current named migration. See [R1-REVIEW](evidence/R1-REVIEW.md).

Implemented: real local PostgreSQL schema/migrations/seed, maintained sessions/password verification/recovery, working TOTP and backup MFA, scoped merchant/action/shop/operator authorization, protected profile/workspace APIs, invitation/ownership/last-owner safeguards, append audit, a transactional PostgreSQL queue, independent compiled Node worker/scheduler, local adapter interfaces and meaningful readiness.

This is the initial P2–P4 security boundary. It is not a complete merchant product or a production release. Full schemas/commands for later media/design/trust/analytics/financial features remain explicitly assigned in the implementation plan.

## Next required setting

**Sol 6.1 Extra High**, stage **X2**: begin P5 catalogue/contact/media work using [X2-HANDOFF](X2-HANDOFF.md). New protected commands, concurrent edits, sensitive changes and uploads require Extra High. H2 is available later for routine UI against stable reviewed interfaces.

The owner must confirm that setting, then say **“Continue X2.”** A plain “Continue” resumes the current stage; it does not confirm a model switch. The reminder is also in README and [RECOMMENDATIONS](../RECOMMENDATIONS.md).

## Evidence

- Frozen `npm ci` plus repeatable guarded cloud setup, migrations, seed, checks, integration tests, dependency audit and production web/worker builds passed.
- PostgreSQL **18.6**, pinned official image digest; pg **8.23.1**, Better Auth **1.7.7**. Identity schema is checked in; runtime auto-migration is disabled.
- Public unit tests: **15 passed**.
- Real PostgreSQL integration tests: **39 passed**, covering migration/constraints, permissions/owner races, MFA/session recovery and reset races, lock-wait revocation/expiry, exact money rejection, atomic budgets, transaction/outbox consistency, process-death recovery, lease/dead-letter/replay, ordering and deadlines.
- Production browser tests: **16 public + 5 private passed**, desktop/mobile, including current protected domain APIs, HTML/Flight denials, UI MFA/recovery, actual no-referrer behavior, schema readiness, accessibility and overflow. Total with unit/integration tests: **75 passed**.
- Lint, strict types, formatting, documentation links and production web/worker build passed. Full dependency audit: **0 vulnerabilities**. Configured-secret artifact scan passed: **419 files / 8 candidate values**, no values printed. General production scanning remains open.
- [R1 migration](evidence/R1-MIGRATION.json) preserved **1,506 shops / 150,004 products**, repeated migrations/seed and local credentials. Upgrade fixtures verify identity/session preservation and intentional invalidation of old MFA proofs. Web and independent worker restarted with database/authentication ready and worker running; live notifications/financial operations remain false.
- Generator ran twice with the same seed: **1,500 synthetic shops and 150,000 synthetic products**, exact unchanged counts. This is generator capability, not the architecture/load benchmark.
- Real worker-stop/restart and database-outage observations: [X1 runtime](evidence/X1-RUNTIME.json). Process recovery does not prove disaster/backup restoration.
- Reports, corrections, provider status and reviewed contracts: [X1-STAGE](evidence/X1-STAGE.md), [R1-REVIEW](evidence/R1-REVIEW.md), [ADR-0003](ADR/0003-identity-and-durable-jobs.md), [X1-SECURITY](X1-SECURITY.md).
- CI is configured; remote GitHub Actions execution is unverified. No production deployment or remote push was performed.
- Reusable cloud configuration is saved as a draft, not applied/published. Review/save it in environment settings and publish to activate it. Fresh-task restoration, Docker-volume persistence and restoration of local-only commits are unverified.

## Plan coverage

| Phase | Status |
|---|---|
| P0 | Stack direction reconciled; initial state/permission/threat contracts reviewed in R1. Future-feature contracts and owner policies remain open. |
| P1 | Web/worker/PostgreSQL setup and initial checks/readiness verified. Full production telemetry, secret scanning and deployment supervision remain later gates. |
| P2 | Initial canonical boundary, financial representation, audit/queue, safe seed/generator and migrations tested. Later feature schemas and live rent/retention policy are open. |
| P3 | Initial sessions, verification/recovery, MFA, permissions, invitations/ownership and current-surface isolation reviewed/fixed/tested. Extend attacks for new handlers. |
| P4 | Initial queue/worker/scheduler/adapters and process/lease/effect/delivery recovery implemented/tested. New media/financial/index handlers need their own consequence tests. |
| P5–P7 | Public read-only groundwork plus private ordinary profile edit. Catalogue/media/LSS/public PostgreSQL discovery and architecture benchmark remain open; X2 begins P5. |
| P8–P12 | Live merchant/operator lifecycle, rent/trust/analytics/AI, security hardening, provider integration, scale/recovery/release remain planned. |
| P13 | Requires an authorized release and real merchant cohort. |

## Reminder to the owner

**R1 review and fixes are complete. Please switch to Sol 6.1 Extra High and say “I’ve switched to Sol 6.1 Extra High. Continue X2.”**

Passing foundation tests closes this stage only. Complete-build and production acceptance remain separate gates.
