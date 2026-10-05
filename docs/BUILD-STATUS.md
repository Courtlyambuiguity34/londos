# Build status and next model setting

Updated 2026-10-05, Africa/Kampala. Branch: `codex/londos-x2-2026-10-05`.

**X2 P9 local incident ownership and authenticated-owner recovery: COMPLETE and verified. Remaining P9 analytics, privacy and cost work is next.** The owner confirmed **Sol 6.1 Extra High**, authorized commits/pushes on this branch, and selected configurable development rent of **UGX 5,000 per 30 days, seven days’ grace, manual reconciliation; live collection disabled**. The assistant records the reported model setting but cannot inspect/change the selector.

Fresh owners open seven kinds of incidents. Kind-specific operator grants filter prioritized queues; native-MFA reviewers claim a distinct assignment/scope, investigate privately, escalate or resolve with reasons and immutable history. Assigned recovery reviewers may revoke the reporting active owner's sessions and outstanding reset tokens. Contact/payment-instruction restoration requires the original owner's fresh confirmation of an exact earlier snapshot, current case/contact versions and unchanged credential generation within 30 minutes. Restoration appends a new version and preserves history. Ordinary support and legacy shop recovery scopes cannot bypass this workflow. Lost-all-factor/email/ownership adjudication remains unavailable pending an approved proof policy. Read [incident evidence](evidence/X2-P9-INCIDENTS.md), [ADR-0009](ADR/0009-local-incidents-and-owner-confirmed-recovery.md) and [local runbook](FAILURE-RECOVERY.md).

The completed local trust packet remains preserved: bounded anonymous reports/private normalized attachments, separate trust scopes, private notes/redacted owner appeals, independent reinstatement, strongest restrictions plus immutable legacy baseline and truthful “Development application reviewed” disclosure. Recovery never changes rent, publication, moderation or operational holds. Read [trust evidence](evidence/X2-P9.md) and [ADR-0008](ADR/0008-local-reporting-and-trust-review.md).

Completed P8 lifecycle and administration remain preserved: private applications, scoped review/reconciliation, atomic provisioning, partial credits/reversals, scheduled due/grace/closure/reopening, owner teams/invitations, address history, occupancy and separately scoped moves/holds/finance exceptions. Read [lifecycle evidence](evidence/X2-P8.md) and [administration evidence](evidence/X2-P8-ADMIN.md).

H (`e65748e`), X1 (`c93261f`), R1 (`cc0aafc`), P5 (`c19a26a`), P6/P7 (`c83a036`), P8 lifecycle (`53ea60f`), P8 administration (`5e148b1`) and P9 trust (`bc8b0aa`) remain preserved. The prototype and its [scale experiment](evidence/X2-P6-P7.md) are finished historical work; do not redo them.

## Verification

- **199 passing tests:** 23 unit, 136 real PostgreSQL integration, 16 fixture public browser and 24 core production-browser tests. The incident packet adds 16 integration and three browser cases, attacks all eight new protected methods, and exercises private HTML/Flight, native session containment, original-owner confirmation and proven lock-wait revocation.
- Lint, strict types, formatting, documentation links and standalone web/independent worker build passed. Dependency audit: **0 vulnerabilities**. Configured-secret artifact scan: **1,354 files / 9 candidate values**, with no values printed. Dependencies and lockfile are unchanged.
- [Migration 012→013](evidence/X2-P9-INCIDENT-MIGRATION.json) preserved all original columns across 36 existing business/permission/financial/administration/trust tables, repeated migration/seed and private credentials/configuration, including 1,506 shops / 150,004 products / 1,504 departments / one revision. Local elapsed time: **101 ms**; production backup restoration/downtime remain unverified. Nonempty contact-history backfill is separately proven in integration fixtures; the main contacts table was empty. Applied migrations 001–012 and historical evidence remain unchanged; 013 is now applied and frozen.
- [Current runtime](evidence/X2-P9-INCIDENT-RUNTIME.json): matching schema-013 web/worker and database public/report browsing. Anonymous incident APIs return 401 with private headers. Explicit repeatable `db:incidents` enables recovery/support only for the verified fictional operator, preserving credentials/default seed privileges. Native fresh MFA, separate incident claims and no self-membership remain required. Existing `db:trust` independent reviewer remains moderation-only.
- Competing assignments/restorations have one winner. Revoked grants/scopes/membership, stale native MFA and changed reporter credential generation during proven lock waits deny writes. Containment fences native old-password sign-in and invalidates outstanding reset tokens, without inventing retroactive cancellation of already-authorized work.

## Next work and model

Continue **X2 / remaining P9 at Sol 6.1 Extra High** using [X2-HANDOFF](X2-HANDOFF.md) and the [master plan](IMPLEMENTATION-PLAN.md). P9.1–P9.4 are verified at their explicit local scope. P9.5–P9.9 analytics/attribution/aggregates/retention/export/deletion/costs remain open, along with live response/identity-proof policy. No new model switch is required. Use **6 Astra Extra High** for R2’s final system/release review, or a concrete unresolved critical architecture issue.

G2’s local six-slice experiment remains accepted within its recorded limits. G3 and full-build gates remain open: remaining P9, P10 AI, wider LSS components/public catalogue pagination and sustained mixed-load/recovery/release evidence. Partial P8 accounting/arrangement gates remain explicit: live callback mismatches, richer exception investigation, unapproved financial arrangements and larger history/target selection. Production policy/providers, public signup and deployment remain separate work. Current public departments initially return 20 products and entrances at most 32 cards; English search does not claim advanced typo/multilingual relevance.

## Environment and persistence

Finished incident source, migration, tests, evidence and documentation are committed/pushed together on this branch; inspect Git for the exact packet SHA. Private configuration, accounts, notifications and browser traces remain ignored. Live collection and notifications remain disabled.

Reusable setup/startup instructions and repository membership use the onboarding draft workflow. Review/save settings and publish the environment to activate saved configuration. A draft does not execute scripts, restart processes or prove fresh-task restoration/Docker volume persistence. Current runtime and remote Git availability are separate evidence.

## Remaining gates

| Boundary | State |
|---|---|
| H / X1 / R1 | Completed foundation and reviewed local security boundary; historical evidence retained. |
| P5–P7 / G2 | Local catalogue, design/publication, discovery and six-slice experiment complete within recorded limits. Wider registry/pagination and deployment-specific cache evidence remain open. |
| P8 | Local lifecycle and administration verified. Unapproved arrangements, richer accounting investigation and live policies/providers remain open. |
| P9 | Local trust, incident ownership and authenticated-owner recovery verified. Privacy-governed analytics/export/deletion, costs and live identity/response policies remain open. |
| P10 / G3 | Scoped provider-neutral AI and broader full-build gate remain open. |
| P11/P12 / R2 | Full-load, production roles/deployment, backup/restore, release dossier and Astra Extra High review remain open. |

**The P9 local incident/recovery packet is done at Sol 6.1 Extra High. Continue P9 analytics/privacy/costs at the same setting; the complete application and production release remain in progress.**
