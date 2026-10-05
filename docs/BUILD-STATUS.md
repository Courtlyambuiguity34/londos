# Build status and next model setting

Updated 2026-10-05, Africa/Kampala. Branch: `codex/londos-x2-2026-10-05`.

**X2 P8 local application/rent lifecycle packet: COMPLETE and verified. P8 administration remains in progress.** The owner confirmed **Sol 6.1 Extra High**, authorized commits/pushes on this implementation branch, and selected configurable development rent of **UGX 5,000 per 30 days, seven days’ grace, manual operator reconciliation; live collection disabled**. The assistant records the requested model setting but cannot inspect/change the selector.

Owners can apply with private evidence; scoped MFA operators review and reconcile referenced invoices. Full first settlement atomically provisions an unpublished shop; partial credits, retries, reversals, renewal and scheduled arrears transitions preserve canonical financial history and moderation. The browser journey continues through design/publication, anonymous discovery/contact, closure and reopening. Read [P8 evidence](evidence/X2-P8.md) and [ADR-0006](ADR/0006-local-applications-and-rent-lifecycle.md).

H (`e65748e`), X1 (`c93261f`), R1 (`cc0aafc`), P5 (`c19a26a`) and P6/P7 (`c83a036`) remain preserved. The local catalogue/design/discovery prototype and its [scale experiment](evidence/X2-P6-P7.md) are finished historical work; do not redo them.

## Verification

- **149 passing tests:** 23 unit, 96 real PostgreSQL integration, 16 fixture public browser and 14 core browser tests. P8 adds 15 integration tests, a desktop lifecycle journey, attacks on all 22 new protected methods and mobile accessibility checks.
- Lint, strict types, formatting, documentation links and standalone web/independent worker build passed. Dependency audit: **0 vulnerabilities**. Configured-secret artifact scan: **931 files / 8 candidate values**, with no values printed.
- [Migration 009→010](evidence/X2-P8-MIGRATION.json) preserved original fields across 18 business/permission tables, repeated migration/seed and credentials, including 1,506 shops / 150,004 products / 1,504 departments / one design revision. Local elapsed time: 35 ms; production backup restoration/downtime remain unverified.
- [Current runtime](evidence/X2-P8-RUNTIME.json): matching schema-010 web/worker and database public browsing. `localRentWorkflow` is true; live financial operations and notifications remain false. Explicit `db:p8` enables the existing fictional finance operator after MFA; ordinary seed privileges remain unchanged.

## Next work and model

Continue **X2 / remaining P8 at Sol 6.1 Extra High** using [X2-HANDOFF](X2-HANDOFF.md) and the [master plan](IMPLEMENTATION-PLAN.md). Finish guided onboarding/membership interfaces, Landlord occupancy/exception operations, audited policy-permitted overrides, slug changes and mall reassignment. No new switch is required. Use **6 Astra Extra High** for R2’s final system/release review, or an earlier concrete unresolved critical architecture issue.

G2’s local six-slice experiment remains accepted within its recorded limits. G3 and the full-build gates remain open: remaining P8 administration, P9 trust/reporting/analytics, P10 AI, wider LSS components/public catalogue pagination and sustained mixed-load/recovery/release evidence. Production policy, providers, account signup and deployment remain separate work. Current public department views initially return 20 products and entrances at most 32 cards; English search does not claim advanced typo/multilingual relevance.

## Environment and persistence

The P8 implementation, tests, evidence and documentation are committed/pushed together after checks; inspect Git for the exact packet SHA. No force push or production deployment is part of this packet. Local credentials/configuration and notification files remain ignored.

Reusable setup/startup instructions and repository membership use the onboarding draft workflow. Review/save settings and publish the environment to activate a saved configuration. A draft does not execute scripts, restart processes or prove fresh-task restoration/Docker volume persistence. Current runtime and remote Git availability are separate evidence.

## Remaining gates

| Boundary | State |
|---|---|
| H / X1 / R1 | Completed foundation and reviewed local security boundary; historical evidence retained. |
| P5–P7 / G2 | Local catalogue, design/publication, discovery and six-slice experiment complete within recorded limits. Wider registry/pagination and deployment-specific cache evidence remain obligations. |
| P8 | Local applications, private evidence, scoped review, development reconciliation/provisioning and scheduled tenancy verified. Administrative completion and live policies/providers remain open. |
| P9/P10 / G3 | Trust/reporting/analytics, operational recovery and scoped provider-neutral AI remain open. |
| P11/P12 / R2 | Full-load, production roles/deployment, backup/restore, release dossier and Astra Extra High review remain open. |

**The P8 local lifecycle packet is done at Sol 6.1 Extra High. Continue P8 administration at the same setting; the complete application and production release remain in progress.**
