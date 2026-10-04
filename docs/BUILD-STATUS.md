# Londos build status and model handoff

Updated: **2026-10-05 (Africa/Kampala)**. Branch: `work`, the existing isolated task branch.

## Current stage

**X1 — Sol 6.1 Extra High secure foundation: COMPLETE and locally verified.** The owner confirmed the setting and instructed “Continue X1.” The assistant cannot verify/change the model-selector UI. The High foundation was committed as `e65748e`; this stage builds on it.

Implemented: real local PostgreSQL schema/migrations/seed, maintained sessions/password verification/recovery, working TOTP and backup MFA, scoped merchant/action/shop/operator authorization, protected profile/workspace APIs, invitation/ownership/last-owner safeguards, append audit, a transactional PostgreSQL queue, independent compiled Node worker/scheduler, local adapter interfaces and meaningful readiness.

This is the initial P2–P4 security boundary. It is not a complete merchant product or a production release. Full schemas/commands for later media/design/trust/analytics/financial features remain explicitly assigned in the implementation plan.

## Next required setting

**6 Astra Extra High**, stage **R1**: review the state/permission/data contracts, implementation and X1 security evidence before dependent protected features are widened.

The owner must confirm that setting, then say **“Continue R1.”** Do not infer the switch from “Continue,” elapsed time or tool availability. The reminder is also in README and [RECOMMENDATIONS](../RECOMMENDATIONS.md). Follow [X1-SECURITY](X1-SECURITY.md) for the review scope; record findings/fixes/tests and the next H2/X2 handoff.

## Evidence

- Frozen `npm ci` plus repeatable guarded cloud setup, migrations, seed, checks, integration tests, dependency audit and production web/worker builds passed.
- PostgreSQL **18.6**, pinned official image digest; pg **8.23.1**, Better Auth **1.7.7**. Identity schema is checked in; runtime auto-migration is disabled.
- Public unit tests: **15 passed**.
- Real PostgreSQL integration tests: **26 passed**, covering migration/constraints, permissions/owner races, actual MFA/session recovery, atomic budgets, transaction/outbox consistency, process-death recovery, lease/dead-letter/replay, ordering and deadlines.
- Production browser tests: **16 public + 4 private passed**, desktop/mobile, including all current protected domain APIs, private HTML/Flight denials, UI MFA enrollment/challenge, accessibility and overflow.
- Full dependency audit: **0 vulnerabilities**. Configured-secret client/server/worker artifact scan passed without printing values. General production secret/security review remains open.
- Generator ran twice with the same seed: **1,500 synthetic shops and 150,000 synthetic products**, exact unchanged counts. This is generator capability, not the architecture/load benchmark.
- Real worker-stop/restart and database-outage observations: [X1 runtime](evidence/X1-RUNTIME.json). Process recovery does not prove disaster/backup restoration.
- Full report, corrections, provider status and review scope: [X1-STAGE](evidence/X1-STAGE.md), [ADR-0003](ADR/0003-identity-and-durable-jobs.md), [X1-SECURITY](X1-SECURITY.md).
- CI is configured; remote GitHub Actions execution is unverified. No production deployment or remote push was performed.
- Reusable cloud configuration is saved as a draft, not applied/published. Review/save it in environment settings and publish to activate it. Fresh-task restoration, Docker-volume persistence and restoration of local-only commits are unverified.

## Plan coverage

| Phase | Status |
|---|---|
| P0 | Stack direction reconciled; initial state/permission/threat contracts documented. Astra review and owner policies remain open. |
| P1 | Web/worker/PostgreSQL setup and initial checks/readiness verified. Full production telemetry, secret scanning and deployment supervision remain later gates. |
| P2 | Initial canonical boundary, financial representation, audit/queue, safe seed/generator and migrations tested. Later feature schemas and live rent/retention policy are open. |
| P3 | Initial sessions, verification/recovery, actual MFA, permission matrix, invitations/ownership and current-surface isolation implemented/tested. Extend attacks as new handlers are introduced. |
| P4 | Initial queue/worker/scheduler/adapters and process/lease/effect/delivery recovery implemented/tested. New media/financial/index handlers need their own consequence tests. |
| P5–P7 | Public read-only groundwork plus private ordinary profile edit only. Catalogue/media/LSS/public PostgreSQL discovery and architecture benchmark remain open. |
| P8–P12 | Live merchant/operator lifecycle, rent/trust/analytics/AI, security hardening, provider integration, scale/recovery/release remain planned. |
| P13 | Requires an authorized release and real merchant cohort. |

## Reminder to the owner

**Done with Sol 6.1 Extra High X1 secure foundation work. Please switch to 6 Astra Extra High and say “I’ve switched to Astra Extra High. Continue R1.”**

After R1, use the next setting recorded by that review for H2 routine features or X2 sensitive implementation. Do not treat passing foundation tests as the complete-build/production gate.
