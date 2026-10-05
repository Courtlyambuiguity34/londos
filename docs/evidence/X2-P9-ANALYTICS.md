# X2 P9: privacy-minimized local pilot analytics

Verified 2026-10-05 on `codex/londos-x2-2026-10-05`, using the owner-reported **Sol 6.1 Extra High**. Baseline: `2686454ce50133fa1e03d72abed56a9732959deb`, the completed incident/recovery packet. This packet completes local P9.5/P9.6 and the aggregate/cohort/backlog portion of P9.7. Resource-cost views, broader governed export/deletion/retention and live privacy approval remain open. [ADR-0010](../ADR/0010-local-pilot-analytics.md) records the contract. Implementation, migration, tests, documentation and inspected captures belong to the same packet commit; inspect Git for its exact SHA.

## Result and measurement limits

Explicit fictional loopback database mode can capture nine public events: mall visits, search submissions, search-result pages, result clicks, shop/department/product views, contact-action clicks and direct entries. Two merchant events derive separately from existing committed publication/catalogue audits joined to tenant-consistent resources. Canonical mutation transactions never depend on analytics storage. Failed/conflicting writes do not become merchant events; historical browser traffic is never reconstructed from audit activity.

Daily counters store only UTC day, canonical shop/merchant scope where applicable, event, observed source, allowlisted result/contact detail and count. Search detail is zero/few/many, never query text or hashes. No visitor/account identifier, cookie, IP, user agent, raw URL/referrer, email, contact value, credential or private evidence is stored in these tables. Capture receipts contain hashed context/action identity and fingerprint plus expiry, not raw event history. Budget keys are hashed contexts/minute windows, not visitor identities.

HMAC-signed rendered-page contexts expire after 30 minutes and bind allowed page actions, rendered result targets and displayed contact channels. Context/action/target/channel retries have one atomic effect, including concurrent requests. Changed-source retries cannot rewrite an observation. Every accepted shop event checks current published design, tenancy, moderation, operational hold and applicable owned active resource. Strict schemas refuse extra private fields and forged merchant events.

Attribution is observed navigation, not verified causal discovery. Per-tab storage retains at most ten shop/source entries for 30 minutes and a pending clicked-shop marker for two minutes. Global mall/search navigation becomes discovery; a fresh empty/external-referrer entry becomes direct; unrecognized navigation is unattributed. Department/product navigation and reloads retain the same shop source until expiry. Blocked or unwritable storage records unattributed observations and cannot invent direct entries. No persistent visitor ID is introduced. Counts are page observations, not unique people, orders or completed sales; contact clicks measure intent.

Capture requires `LONDOS_PILOT_ANALYTICS=true`, valid local loopback configuration and database public mode. Default/fixture/live modes do not collect. Known bots, native internal-account cookies, DNT and GPC are excluded where practical; spoofed traffic is not fraud-proofed. Exact-origin and bounded JSON/schema checks protect intake. Global 2,000/minute and context 30/minute budgets are atomic with receipts and counters. A separate two-connection pool has 250 ms connection, 500 ms statement and 200 ms lock limits. Browser capture is lossy, asynchronous and bounded to 1.5 seconds, with no durable retry queue; public navigation/contact never waits. Generic accepted receipts disclose no target existence, dedupe, eligibility or storage outcome. Outages/limits can undercount without breaking storefronts or canonical merchant writes.

Fresh current owners see only their shop aggregates. Ownership is rechecked after merchant serialization; staff and scoped support have no analytics fallback. A new explicit global analytics grant plus native fresh MFA gives operators bounded aggregate/cohort/renewal/backlog reads, with a final authority check after queries. This permission grants no private evidence/contact/history/ledger viewer or workflow decisions. Application cohort and first-publication duration include measured applications only; unpublished or incompatible earlier history is not counted as zero duration. Renewals distinguish current full net-payment coverage from waiver-supported settlement, deducting referenced reversals. Backlogs report current counts/oldest age by kind/state, never private case identities or notes. Neither backlog age nor publication duration measures staff working time.

Development analytics retention accepts 7–90 UTC calendar days including today, default 30. Reads exclude old/future aggregate days immediately. Existing lease-fenced maintenance deletes at most 1,000 expired receipts and 1,000 old metrics per run. Invalid retention disables capture and aggregate deletion; a stopped worker leaves physical cleanup pending. Canonical business/financial/audit records are preserved. This contract covers only minimal analytics storage: P9.8 must govern verification, enquiries, incidents, legal constraints and backups separately. Rent closure never triggers deletion here.

## Verification

| Check                                                                         | Result                                                                                                                                    |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                               | Lint, generated route types, strict TypeScript, 23 unit tests and documentation links passed.                                             |
| `npm run test:integration`                                                    | **155 passed** across seven real PostgreSQL files, including 19 analytics cases.                                                          |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`      | **16 passed** for the preserved public fixture preview.                                                                                   |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core` | **28 passed** with compiled web/worker and an isolated canonical database, including four analytics cases.                                |
| `npm run build`                                                               | Matching standalone web and independent worker built after the final attribution correction.                                              |
| Formatting / documentation links / `git diff --check`                         | Passed.                                                                                                                                   |
| `npm audit --audit-level=high`                                                | **0 vulnerabilities**; dependencies and lockfile unchanged.                                                                               |
| `npm run check:bundle-secrets`                                                | **1,410 artifact files / 9 known configured candidate values**, no match; values never printed. Exact-value scanning is bounded evidence. |

Total: **222 passing tests = 23 unit + 155 integration + 16 fixture browser + 28 core browser**. Completed baseline source and historical evidence are preserved; these checks do not certify production deployment, traffic authenticity or sustained mixed-load capacity.

Integration coverage includes:

- Nonempty schema-013 upgrade/default grant preservation and tenant-consistent database constraints.
- Strict private-field/forged-event denial; signature, expiry, action, target and contact-channel binding; all nine public event semantics and minimal stored columns.
- Concurrent identical retries, changed-source retries, concurrent distinct observations and no lost aggregate increments. Budget failure rolls back receipt/counter together and permits a later valid retry.
- Current public eligibility/resource ownership, published design, moderation and operational holds; internal/bot/privacy filters and disabled/fixture/invalid policy containment.
- UTC read cutoffs and physical retention boundaries; invalid retention cannot purge old metrics; business/audit records remain unchanged.
- Foreign merchants, staff and old operator grants denied; shop aggregates isolated; ownership revoked during a proven merchant-lock wait denied.
- Analytics grant revocation and native-MFA aging during proven query-lock waits denied by the final operator check.
- Actual catalogue/publication success while analytics storage is unavailable, conflicting publication refusal and committed audit-derived counts.
- Cohort/first-publish durations, incompatible history exclusion, net paid versus waiver settlement versus referenced reversals, and no private identity/ledger detail disclosure.
- Search result buckets store only zero/few/many; no raw sensitive query storage.

Browser cases exercise real direct and discovery routes, search submission/results/clicks, department/product/reload continuity, contact intent and bounded tab storage. An independent context with blocked session storage proves unattributed views without extra direct entries. Public origin/body/schema/context/privacy checks, an actual analytics-table outage and network abort leave browsing/contact available. Both new protected GET handlers deny anonymous/foreign actors; private HTML/Flight and headers are checked. Native fresh owner and analytics-only MFA operator dashboards pass axe; analytics permission alone cannot read incidents/applications. Mobile window links, keyboard focus and overflow checks pass.

Two integration fixture corrections supplied the operational-hold schema's required reason and actor; assertions were retained and the complete clean suite passed. Visual inspection exposed the blocked-storage attribution mismatch; client behavior and the existing browser case were corrected before the final complete browser run. A newly generated ignored runtime-evidence helper also received proper types/retry handling to pass repository lint. No application check was disabled or replaced with a trivial assertion.

## Upgrade and current runtime

[Migration evidence](X2-P9-ANALYTICS-MIGRATION.json) records schema **013→014**, **34 ms** locally, with original-column whole-row digests/counts unchanged across **40 existing business/permission/financial/administration/trust/incident tables**. Repeated migration/seed preserved records and all three private configuration/account files. The main dataset remains 1,506 shops / 150,004 products / 1,504 departments / one design revision. The analytics grant was added only afterward by explicit guarded setup; ordinary seed grants remain unchanged. Migrations 001–013 were preserved; applied 014 is now frozen too.

[Runtime evidence](X2-P9-ANALYTICS-RUNTIME.json) records the matching schema-014 web/worker, database/authentication readiness, public shop/search requests and anonymous analytics API denials with private headers. `localPilotAnalytics=true` reports only explicit fictional development capture; `liveAnalytics=false`, live collection and live notifications remain disabled. Repeated `npm run db:analytics` preserves existing grants, private configuration and credentials. Native fresh MFA remains required. Only verified task-owned old web/worker processes were stopped and replaced by the matching build.

This is local logical preservation/current-runtime evidence. It does not establish production backup/restore, downtime, fresh-task restoration or Docker volume persistence. The existing six-slice performance experiment was preserved without rerunning finished benchmark work; bounded analytics queries/pools do not establish sustained analytics capacity. Setup is documented in [DEVELOPMENT](../DEVELOPMENT.md).

## Inspected captures and next work

All three captures were opened and visually inspected: bounded fictional aggregate layouts, no passwords/factor codes/live credentials, and visible mobile keyboard focus. Older images regenerated by regression tests were restored from the completed baseline.

- [Owner shop aggregates](images/x2-p9-analytics-owner-desktop.png).
- [Analytics-only operator summaries](images/x2-p9-analytics-operator-desktop.png).
- [Mobile seven-day window and keyboard focus](images/x2-p9-analytics-mobile.png).

[Illustrations](../ILLUSTRATIONS.md) show signed capture, separate canonical activity, scoped aggregates and bounded cleanup. Continue **P9.8/P9.9 at Sol 6.1 Extra High**: governed exports/deletion/retention plus measurable per-shop resource/support/verification/rent costs and the unfinished P9.7 cost views. Live identity-proof, escalation ownership/response targets, privacy/legal retention and provider policy remain gates. The complete application and production release remain in progress; final **6 Astra Extra High R2** review is later.
