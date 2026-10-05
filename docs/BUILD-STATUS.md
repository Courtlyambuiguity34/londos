# Build status and next model setting

Updated 2026-10-05, Africa/Kampala. Branch: `codex/londos-x2-2026-10-05`.

**X2 P9 local privacy-minimized analytics: COMPLETE and verified at its recorded scope. Governed export/deletion/retention and measurable costs are next.** The owner confirmed **Sol 6.1 Extra High**, authorized commits/pushes on this branch, and selected configurable development rent of **UGX 5,000 per 30 days, seven days’ grace, manual reconciliation; live collection disabled**. The assistant records the reported model setting but cannot inspect/change the selector.

Nine minimal daily public events use short-lived signed rendered contexts, atomic dedupe and bounded observed direct/discovery/unattributed source. Blocked storage stays unattributed. Two merchant events derive separately from committed audits, preserving canonical writes during analytics failure. Fresh owners see only their shop aggregates; a new explicit analytics grant and native fresh MFA guard operator cohort/time-to-first-publish, net-paid versus waiver-supported renewals and current case backlogs. Capture is optional fictional loopback database functionality; no visitor identity/raw sensitive query is stored and live analytics remains disabled. Retention is configurable 7–90 UTC days, default 30, with immediate read cutoffs and bounded fenced cleanup. Read [analytics evidence](evidence/X2-P9-ANALYTICS.md) and [ADR-0010](ADR/0010-local-pilot-analytics.md). Resource-cost views and broader governed privacy remain unfinished P9 work.

Fresh owners open seven kinds of incidents. Kind-specific operator grants filter prioritized queues; native-MFA reviewers claim a distinct assignment/scope, investigate privately, escalate or resolve with reasons and immutable history. Assigned recovery reviewers may revoke the reporting active owner's sessions and outstanding reset tokens. Contact/payment-instruction restoration requires the original owner's fresh confirmation of an exact earlier snapshot, current case/contact versions and unchanged credential generation within 30 minutes. Restoration appends a new version and preserves history. Ordinary support and legacy shop recovery scopes cannot bypass this workflow. Lost-all-factor/email/ownership adjudication remains unavailable pending an approved proof policy. Read [incident evidence](evidence/X2-P9-INCIDENTS.md), [ADR-0009](ADR/0009-local-incidents-and-owner-confirmed-recovery.md) and [local runbook](FAILURE-RECOVERY.md).

The completed local trust packet remains preserved: bounded anonymous reports/private normalized attachments, separate trust scopes, private notes/redacted owner appeals, independent reinstatement, strongest restrictions plus immutable legacy baseline and truthful “Development application reviewed” disclosure. Recovery never changes rent, publication, moderation or operational holds. Read [trust evidence](evidence/X2-P9.md) and [ADR-0008](ADR/0008-local-reporting-and-trust-review.md).

Completed P8 lifecycle and administration remain preserved: private applications, scoped review/reconciliation, atomic provisioning, partial credits/reversals, scheduled due/grace/closure/reopening, owner teams/invitations, address history, occupancy and separately scoped moves/holds/finance exceptions. Read [lifecycle evidence](evidence/X2-P8.md) and [administration evidence](evidence/X2-P8-ADMIN.md).

H (`e65748e`), X1 (`c93261f`), R1 (`cc0aafc`), P5 (`c19a26a`), P6/P7 (`c83a036`), P8 lifecycle (`53ea60f`), P8 administration (`5e148b1`), P9 trust (`bc8b0aa`) and incidents (`2686454`) remain preserved. The prototype and its [scale experiment](evidence/X2-P6-P7.md) are finished historical work; do not redo them.

## Verification

- **222 passing tests:** 23 unit, 155 real PostgreSQL integration, 16 fixture public browser and 28 core production-browser tests. Analytics adds 19 integration/four browser cases, including both new protected GET methods, private HTML/Flight, origin/schema/context/privacy checks, actual storage failure, blocked navigation storage, native fresh MFA and desktop/mobile accessibility.
- Lint, strict types, formatting, documentation links and standalone web/independent worker build passed. Dependency audit: **0 vulnerabilities**. Configured-secret artifact scan: **1,410 files / 9 candidate values**, with no values printed. Dependencies and lockfile are unchanged.
- [Migration 013→014](evidence/X2-P9-ANALYTICS-MIGRATION.json) preserved all original columns across **40 existing tables**, repeated migration/seed and three private configuration/account files, including 1,506 shops / 150,004 products / 1,504 departments / one revision. Local elapsed time: **34 ms**; production backup restoration/downtime remain unverified. Applied migrations 001–013 and historical evidence remain unchanged; 014 is now applied and frozen.
- [Current runtime](evidence/X2-P9-ANALYTICS-RUNTIME.json): matching schema-014 web/worker, database/authentication readiness, public shop/search and anonymous analytics API 401s with private headers. Explicit repeatable `db:analytics` grants only analytics to the verified fictional operator, preserving existing grants/credentials/configuration. Capture still requires an explicit valid development flag. Default seed and the independent moderation-only reviewer stay unchanged; live analytics/collection/notifications remain disabled.
- Atomic concurrent dedupe and distinct increments pass. Proven merchant/query lock waits deny revoked ownership/analytics grants and aged native MFA. Expired aggregates are excluded/purged within the configured UTC boundary; invalid retention cannot purge history. Actual publication/catalogue mutations succeed during analytics-table failure and retain committed audit counts. Paid renewal, waiver and linked reversal distinctions are checked against real constrained SQL fixtures.
- Completed incident containment/restoration, trust restrictions/appeals and P8 concurrency/security tests remain passing. Historical upgrade/runtime and benchmark evidence remain retained at their original measured scope.

## Next work and model

Continue **X2 / P9.8–P9.9 at Sol 6.1 Extra High** using [X2-HANDOFF](X2-HANDOFF.md) and the [master plan](IMPLEMENTATION-PLAN.md). P9.1–P9.6 are verified at their explicit local scope. P9.7 is partial until resource-cost/working-time views are addressed with P9.9. Broader governed exports/deletion/retention, costs and live response/identity-proof/privacy policy remain open. No new model switch is required. Use **6 Astra Extra High** for R2’s final system/release review, or a concrete unresolved critical architecture issue.

G2’s local six-slice experiment remains accepted within its recorded limits. G3 and full-build gates remain open: remaining P9, P10 AI, wider LSS components/public catalogue pagination and sustained mixed-load/recovery/release evidence. Partial P8 accounting/arrangement gates remain explicit: live callback mismatches, richer exception investigation, unapproved financial arrangements and larger history/target selection. Production policy/providers, public signup and deployment remain separate work. Current public departments initially return 20 products and entrances at most 32 cards; English search does not claim advanced typo/multilingual relevance.

## Environment and persistence

Finished analytics source, migration, tests, evidence, illustrations and documentation are committed/pushed together on this branch; inspect Git for the exact packet SHA. Private configuration, accounts, notifications and browser traces remain ignored. Live analytics, collection and notifications remain disabled.

Reusable setup/startup instructions and repository membership use the onboarding draft workflow. Review/save settings and publish the environment to activate saved configuration. A draft does not execute scripts, restart processes or prove fresh-task restoration/Docker volume persistence. Current runtime and remote Git availability are separate evidence.

## Remaining gates

| Boundary | State |
|---|---|
| H / X1 / R1 | Completed foundation and reviewed local security boundary; historical evidence retained. |
| P5–P7 / G2 | Local catalogue, design/publication, discovery and six-slice experiment complete within recorded limits. Wider registry/pagination and deployment-specific cache evidence remain open. |
| P8 | Local lifecycle and administration verified. Unapproved arrangements, richer accounting investigation and live policies/providers remain open. |
| P9 | Local trust, incidents/owner-confirmed recovery, pilot events/attribution and scoped aggregate/cohort/backlog views verified. P9.7 cost views, broader governed export/deletion/retention, costs and live identity/response/privacy policies remain open. |
| P10 / G3 | Scoped provider-neutral AI and broader full-build gate remain open. |
| P11/P12 / R2 | Full-load, production roles/deployment, backup/restore, release dossier and Astra Extra High review remain open. |

**The P9 local analytics packet is done at Sol 6.1 Extra High. Continue governed privacy and costs at the same setting; the complete application and production release remain in progress.**
