# Build status and next model setting

Updated 2026-10-05, Africa/Kampala. Branch: `codex/londos-x2-2026-10-05`.

**X2 P9 local reporting, moderation, appeals and development verification: COMPLETE and verified. Remaining P9 recovery, analytics and privacy work is next.** The owner confirmed **Sol 6.1 Extra High**, authorized commits/pushes on this branch, and selected configurable development rent of **UGX 5,000 per 30 days, seven days’ grace, manual reconciliation; live collection disabled**. The assistant records the reported model setting but cannot inspect/change the selector.

Customers can report fictional shop concerns anonymously, retry safely and attach one private normalized image. Native-MFA operators need separate moderation permission and a claimed trust case to investigate or decide. Fresh owners receive redacted decisions and can appeal; a different reviewer must clear the last reviewer’s restriction. Strongest case restrictions and an immutable legacy baseline prevent one case from lifting another. Restoration preserves rent, publication and operational holds. Public verification says only “Development application reviewed”, derived from an approved application with reviewed private evidence. Read [P9 evidence](evidence/X2-P9.md) and [ADR-0008](ADR/0008-local-reporting-and-trust-review.md).

Completed P8 lifecycle and administration remain preserved: private applications, scoped review/reconciliation, atomic provisioning, partial credits/reversals, scheduled due/grace/closure/reopening, owner teams/invitations, address history, occupancy and separately scoped moves/holds/finance exceptions. Read [lifecycle evidence](evidence/X2-P8.md) and [administration evidence](evidence/X2-P8-ADMIN.md).

H (`e65748e`), X1 (`c93261f`), R1 (`cc0aafc`), P5 (`c19a26a`), P6/P7 (`c83a036`), P8 lifecycle (`53ea60f`) and P8 administration (`5e148b1`) remain preserved. The prototype and its [scale experiment](evidence/X2-P6-P7.md) are finished historical work; do not redo them.

## Verification

- **180 passing tests:** 23 unit, 120 real PostgreSQL integration, 16 fixture public browser and 21 core production-browser tests. P9 adds 16 integration and four browser cases, attacks all eight new protected methods, and exercises private HTML/Flight and public-intake abuse controls.
- Lint, strict types, formatting, documentation links and standalone web/independent worker build passed. Dependency audit: **0 vulnerabilities**. Configured-secret artifact scan: **1,254 files / 9 candidate values**, with no values printed. Dependencies and lockfile are unchanged.
- [Migration 011→012](evidence/X2-P9-MIGRATION.json) preserved all original columns across 29 existing business/permission/financial/administration tables, repeated migration/seed and credentials, including 1,506 shops / 150,004 products / 1,504 departments / one revision. Local elapsed time: **47 ms**; production backup restoration/downtime remain unverified. Applied migrations 001–011 and historical evidence remain unchanged.
- [Current runtime](evidence/X2-P9-RUNTIME.json): matching schema-012 web/worker and database public/report browsing. Anonymous trust APIs return 401 with private headers. Explicit `db:trust` enables only fictional local review identities; its independent reviewer has moderation permission only, no merchant memberships and preserved private credentials. Ordinary seed grants remain unchanged; native MFA and distinct claims remain required.
- The existing design journey now blocks preview during an in-flight save and waits for the correct saved revision; a held-request regression check covers the timing failure. Guest enquiry submission now uses shared canonical eligibility, including operational holds.

## Next work and model

Continue **X2 / remaining P9 at Sol 6.1 Extra High** using [X2-HANDOFF](X2-HANDOFF.md) and the [master plan](IMPLEMENTATION-PLAN.md). P9.1/P9.2 are implemented at their explicit local scope. P9.3 has a prioritized trust queue; broader queue ownership/escalation, P9.4 incidents/recovery, P9.5–P9.9 analytics/attribution/aggregates/retention/export/costs remain open. No new model switch is required. Use **6 Astra Extra High** for R2’s final system/release review, or a concrete unresolved critical architecture issue.

G2’s local six-slice experiment remains accepted within its recorded limits. G3 and full-build gates remain open: remaining P9, P10 AI, wider LSS components/public catalogue pagination and sustained mixed-load/recovery/release evidence. Partial P8 accounting/arrangement gates remain explicit: live callback mismatches, richer exception investigation, unapproved financial arrangements and larger history/target selection. Production policy/providers, public signup and deployment remain separate work. Current public departments initially return 20 products and entrances at most 32 cards; English search does not claim advanced typo/multilingual relevance.

## Environment and persistence

Finished P9 source, tests, evidence and documentation are committed/pushed together on this branch; inspect Git for the exact packet SHA. Private configuration, accounts, notifications and browser traces remain ignored. Live collection and notifications remain disabled.

Reusable setup/startup instructions and repository membership use the onboarding draft workflow. Review/save settings and publish the environment to activate saved configuration. A draft does not execute scripts, restart processes or prove fresh-task restoration/Docker volume persistence. Current runtime and remote Git availability are separate evidence.

## Remaining gates

| Boundary | State |
|---|---|
| H / X1 / R1 | Completed foundation and reviewed local security boundary; historical evidence retained. |
| P5–P7 / G2 | Local catalogue, design/publication, discovery and six-slice experiment complete within recorded limits. Wider registry/pagination and deployment-specific cache evidence remain open. |
| P8 | Local lifecycle and administration verified. Unapproved arrangements, richer accounting investigation and live policies/providers remain open. |
| P9 | Local reporting, moderation, appeals and truthful development verification verified. Prioritized trust queue exists; broader incidents/recovery, privacy-governed analytics/export/deletion and costs remain open. |
| P10 / G3 | Scoped provider-neutral AI and broader full-build gate remain open. |
| P11/P12 / R2 | Full-load, production roles/deployment, backup/restore, release dossier and Astra Extra High review remain open. |

**The P9 local trust packet is done at Sol 6.1 Extra High. Continue remaining P9 at the same setting; the complete application and production release remain in progress.**
