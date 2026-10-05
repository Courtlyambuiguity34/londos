# Build status and next model setting

Updated 2026-10-05, Africa/Kampala. Branch: `codex/londos-x2-2026-10-05`.

**X2 P8 local lifecycle and administration packets: COMPLETE and verified. Next: P9 trust and analytics.** The owner confirmed **Sol 6.1 Extra High**, authorized commits/pushes on this implementation branch, and selected configurable development rent of **UGX 5,000 per 30 days, seven days’ grace, manual operator reconciliation; live collection disabled**. The assistant records the requested model setting but cannot inspect/change the selector.

Owners can apply with private evidence; scoped MFA operators review and reconcile referenced invoices. Full first settlement atomically provisions an unpublished shop; partial credits, retries, reversals, renewal and scheduled arrears transitions preserve canonical financial history and moderation. The browser journey continues through design/publication, anonymous discovery/contact, closure and reopening. Read [P8 evidence](evidence/X2-P8.md) and [ADR-0006](ADR/0006-local-applications-and-rent-lifecycle.md).

Owners now have versioned team management, invitation acceptance, per-shop staff grants, setup guidance and stable address changes. Separately scoped MFA operations provide occupancy, audited mall reassignment and pause/resume; scoped finance exceptions stay separate. An operational hold blocks shop/search/contact/media independently of rent and moderation, and resume removes only that hold. Read [administration evidence](evidence/X2-P8-ADMIN.md) and [ADR-0007](ADR/0007-local-administration-and-shop-addresses.md).

H (`e65748e`), X1 (`c93261f`), R1 (`cc0aafc`), P5 (`c19a26a`), P6/P7 (`c83a036`) and P8 lifecycle (`53ea60f`) remain preserved. The local catalogue/design/discovery prototype and its [scale experiment](evidence/X2-P6-P7.md) are finished historical work; do not redo them.

## Verification

- **160 passing tests:** 23 unit, 104 real PostgreSQL integration, 16 fixture public browser and 17 core browser tests. Administration adds eight integration cases and three browser cases, including attacks on all ten new protected HTTP methods and private HTML/Flight boundaries.
- Lint, strict types, formatting, documentation links and standalone web/independent worker build passed. Dependency audit: **0 vulnerabilities**. Configured-secret artifact scan: **1,100 files / 8 candidate values**, with no values printed. Dependencies and lockfile are unchanged.
- [Migration 010→011](evidence/X2-P8-ADMIN-MIGRATION.json) preserved all original columns across 26 business/permission/financial tables, repeated migration/seed and credentials, including 1,506 shops / 150,004 products / 1,504 departments / one design revision. Local elapsed time: 50 ms; production backup restoration/downtime remain unverified. Previous [009→010 evidence](evidence/X2-P8-MIGRATION.json) is retained.
- [Current runtime](evidence/X2-P8-ADMIN-RUNTIME.json): matching schema-011 web/worker and database public browsing. `localRentWorkflow` is true; live financial operations and notifications remain false. Explicit `db:p8` and `db:operations` enable the verified fictional operator only; ordinary seed privileges remain unchanged and native MFA is required.

## Next work and model

Continue **X2 / P9 at Sol 6.1 Extra High** using [X2-HANDOFF](X2-HANDOFF.md) and the [master plan](IMPLEMENTATION-PLAN.md). Begin scoped reporting/moderation and truthful verification; then incident recovery, privacy-aware analytics and governed retention/export. No new switch is required. Use **6 Astra Extra High** for R2’s final system/release review, or an earlier concrete unresolved critical architecture issue.

G2’s local six-slice experiment remains accepted within its recorded limits. G3 and the full-build gates remain open: P9 trust/reporting/analytics, P10 AI, wider LSS components/public catalogue pagination and sustained mixed-load/recovery/release evidence. The master plan retains partial P8 accounting/arrangement gates: live callback mismatches and richer exception investigation, unapproved financial arrangements and larger history/target selection remain obligations. Production policy, providers, account signup and deployment remain separate work. Current public department views initially return 20 products and entrances at most 32 cards; English search does not claim advanced typo/multilingual relevance.

## Environment and persistence

The P8 implementation, tests, evidence and documentation are committed/pushed together after checks; inspect Git for the exact packet SHA. No force push or production deployment is part of this packet. Local credentials/configuration and notification files remain ignored.

Reusable setup/startup instructions and repository membership use the onboarding draft workflow. Review/save settings and publish the environment to activate a saved configuration. A draft does not execute scripts, restart processes or prove fresh-task restoration/Docker volume persistence. Current runtime and remote Git availability are separate evidence.

## Remaining gates

| Boundary | State |
|---|---|
| H / X1 / R1 | Completed foundation and reviewed local security boundary; historical evidence retained. |
| P5–P7 / G2 | Local catalogue, design/publication, discovery and six-slice experiment complete within recorded limits. Wider registry/pagination and deployment-specific cache evidence remain obligations. |
| P8 | Local lifecycle and administration verified, including team/addresses, independent scoped operations and finance exceptions. Unapproved arrangements, richer accounting investigation and live policies/providers remain open. |
| P9/P10 / G3 | Trust/reporting/analytics, operational recovery and scoped provider-neutral AI remain open. |
| P11/P12 / R2 | Full-load, production roles/deployment, backup/restore, release dossier and Astra Extra High review remain open. |

**The P8 local administration packet is done at Sol 6.1 Extra High. Continue P9 at the same setting; the complete application and production release remain in progress.**
