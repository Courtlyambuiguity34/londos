# X2 / P9 measurable resources and reported operating costs

Recorded 2026-10-06, UTC, on `codex/londos-x2-2026-10-05`, using the owner-confirmed **Sol 6.1 Extra High** workflow. This packet completes locally measurable P9.7 resource-cost views and P9.9 reporting. It preserves the completed trust, incidents, analytics, privacy and P5–P8 contracts. P9.8 remains partial at legal retention, physical backups, full subject-access and account deletion; the full build and release remain unfinished.

Read [ADR-0012](../ADR/0012-local-resource-cost-reporting.md), [contracts](../CONTRACTS.md), [setup](../DEVELOPMENT.md), [security](../X1-SECURITY.md) and [handoff](../X2-HANDOFF.md). No provider bill, hourly rate, bandwidth meter or independent staff timer is configured. Reported expenses never charge merchants or alter rent credits.

## Sources and precision

| Source | Verified meaning | Limit |
|---|---|---|
| Managed `media_blobs` joined to canonical shop/merchant assets | Current logical SQL byte lengths and variant/state counts | Excludes fixtures/external files, physical database overhead, WAL/backups and replication; no image bytes or storage keys returned |
| `media_quotas` | Recorded current storage and reserved headroom | Reservation is not stored data; missing shop metadata is explicitly unavailable |
| Tenant-consistent `jobs` rows | Current shop-bound queue states and attempt-counter sums | Authorized replay resets attempts; not lifetime executions, latency, CPU time or money |
| Merchant/platform shared jobs | Separate platform scope totals | No invented allocation to individual shops; payloads are excluded |
| Application/trust evidence | Coarse platform byte/count totals | No case IDs, contents, names or evidence-view permission; pre-shop application volume is unassigned |
| New immutable `resource_cost_entries` | Operator-reported support, verification and rent-collection minutes and UGX expense minor units | Manual, incomplete coverage; no inferred rate, independent verification, conversion or merchant charge |
| Bandwidth, AI use/bills, compute/storage prices and live collection fees | Explicitly unavailable | Absence is not zero actual cost; backlog age is not working time |

Integer database aggregates and money are returned as decimal strings; the interface does not round large values through JavaScript floating point. Summaries use 7/30/90 UTC calendar days including today. Corrections count against the original work day even when recorded later. Journal pagination covers all work dates independently of the summary window.

## Authority, commands and history

Fresh native current owners see only safe shop aggregates. Staff, foreign merchants and legacy support scopes cannot substitute. Explicit `costs` permission plus native fresh MFA permits minimal platform aggregates and a 20-shop UUID-cursor selection queue. Private journal reads and commands additionally require a reasoned claim into distinct `operator_cost_scopes`; active merchant self-membership is denied. Claim compares the canonical shop version; repeated claim has one scope/audit and never changes that shop version.

The five new protected methods use native actor resolution, exact mutation origin, bounded strict JSON, private no-store/no-referrer responses and pre-stream HTML/Flight checks. Shop operations serialize on merchant and native user locks and recheck owner/grant/MFA/scope after waits and before returning. Platform reads recheck native current authority after aggregates. Private entry reasons and operator identities never reach owners/public browsing; reported-entry audits contain only category metadata, and the scope-claim reason remains private.

Original entries accept three categories, the last 90 UTC work days, 0–480 integer minutes, UGX 0–1,000,000,000 integer minor units and at least one nonzero quantity, with reason/confirmation. At most 100 originals per shop per UTC creation day are accepted; this boundary is independent of the PostgreSQL session timezone. Exact corrections remain possible after reaching that limit. Independent native scopes, immutable retry key/fingerprint and journal version fence retries and concurrency. An unchanged retry returns its original ID; changed or cross-shop payload reuse conflicts. Corrections append one exact linked negative entry with the same tenant/shop/category/day/currency. SQL rejects history rewrites, malformed corrections and double reversals. Entry, version and audit commit together; no jobs or financial effects are introduced.

## Verification

Final checks pass **285 tests**: 23 unit, **212 real PostgreSQL integration**, 16 fixture browser and **34 core production-browser** tests. No failing, skipped or disabled cases are counted as passing. The packet adds **28 integration and three browser cases**.

| Command | Outcome |
|---|---|
| `npm run check` | Lint, strict types, 23 unit tests and documentation links passed |
| `npm run format:check` | Passed |
| `npm run build` | Standalone production app and separate independent worker passed |
| `npm run test:integration` | 212 passed, including all prior suites and 28 cost cases |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 16 fixture public browser cases passed |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core` | 34 native core browser cases passed |
| `npm audit --audit-level=high` | Passed, zero vulnerabilities |
| `npm run check:bundle-secrets` | Exact configured-value artifact scan passed; 1,571 artifact files / nine candidate values, no values printed |
| Final staged configured-value scan | 46 source/test/evidence/documentation files passed against nine candidate values; private files, lockfile and applied prior migrations excluded |

[Integration tests](../../tests/integration/costs.test.ts) verify additive/repeated upgrade without implicit grants/history, strict forged fields/units/day bounds, owner/staff/foreign/operator isolation, actual stored bytes/reserved quota, canonical queue attribution and replay-counter reset, unknown sources, separate grants/scopes, self-conflict and versioned claims. They cover reported category/redaction, eight concurrent identical retries, changed/cross-shop retry keys, competing versions/reversals, tenant foreign keys, direct SQL constraints, 7/30/90 UTC boundaries, later corrections, 20-row paging, unchanged financial/business/privacy state and actual SQL rollback/retry. Proven PostgreSQL waits exercise revoked owner/grant/scope and aged native MFA; platform reads deny a grant revoked during a blocked aggregate. Private evidence totals reveal no content. A non-UTC session exercises the daily original limit without preventing exact correction.

[Desktop native tests](../../tests/e2e-core/zzzzzzz-costs.spec.ts) exercise owner resource reads, a separately enrolled costs-only operator, native fresh MFA, separate shop claim, recorded verification work and exact correction. They attack all five methods anonymously and with foreign/non-costs actors, private owner/operator HTML/Flight, forged actor/origin/query fields and revoked scope, and prove costs-only grants cannot read applications/incidents/privacy/analytics. [Mobile tests](../../tests/e2e-core/costs-mobile.spec.ts) exercise native owner/window selection, keyboard access, accessibility and horizontal-overflow checks. Capture assertions inspect actual stored byte totals and owner redaction.

An initial focused browser run correctly rejected reuse of the same TOTP on a second login. The fixture now uses an unused native recovery code; no authentication check was weakened and no code was logged or captured. The focused rerun and complete suite pass. Final review corrected missing quota metadata to show unavailable and made the daily rate boundary explicitly UTC; affected integration/build/browser checks were rerun.

## Upgrade, runtime and preserved work

[015→016 upgrade evidence](X2-P9-COSTS-MIGRATION.json) records **48 original tables**, comparing counts and sorted whole-row digests over every original column before/after migration and repeated migration/seed. It preserves 1,506 shops, 150,004 products, 1,504 departments, one design revision, privacy holds/history and three private configuration/account files. The new journal/scopes/state and read indexes are additive; original business state is unchanged. Elapsed **28 ms** is local migration timing, not production downtime, physical backup or restore evidence. Applied 001–015, historical evidence, dependencies and lockfile remain unchanged. Applied **016 is now frozen**.

[Current runtime evidence](X2-P9-COSTS-RUNTIME.json) verifies matching schema-016 compiled app/worker, database/authentication/worker readiness, public shop/search and anonymous cost 401s with private headers and no private account email. Repeating guarded `db:costs` adds only costs to the verified fictional operator, preserving previous grants and three private files; ordinary seed remains unchanged and the independent trust reviewer remains moderation-only. Main journal remains empty. Main/default privacy erasure and live collection/analytics/notifications/erasure remain disabled. Disposable test databases alone receive reported work and optional privacy effects.

The build artifact scan checks exact configured values, not every possible secret pattern; the final staged source/evidence/docs receive the same exact-value scan before commit. Browser traces/private account/notification/configuration files remain ignored. Earlier tracked evidence images regenerated by the regression harness are restored to their committed versions; only the three new inspected cost captures belong to this packet.

## Inspected illustrations

- [Owner desktop resource summary](images/x2-p9-costs-owner-desktop.png)
- [Scoped operator reporting journal](images/x2-p9-costs-journal-desktop.png)
- [Mobile owner resource summary](images/x2-p9-costs-mobile.png)

These are fictional development captures, not measured operating bills or production workflows. [Illustrations](../ILLUSTRATIONS.md) maps sources and authority. Continue **P10 provider-neutral AI contracts at Sol 6.1 Extra High**; Gemini/OpenAI live access, model quality, price accounting and provider secret configuration remain unverified. Wider LSS/public pagination, P9.8 live obligations, partial P8 accounting/policies and P11/P12/R2 release work remain open.
