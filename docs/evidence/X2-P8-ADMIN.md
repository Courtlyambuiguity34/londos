# X2 P8: local administration verification

Recorded 2026-10-05, Africa/Kampala, on `codex/londos-x2-2026-10-05`, continuing the owner-reported **Sol 6.1 Extra High** setting. Baseline: pushed P8 lifecycle commit `53ea60f823c55f265d1f911d1d3d8b2e03e0e769`. This packet preserves that finished work and adds the local administrative contract in [ADR-0007](../ADR/0007-local-administration-and-shop-addresses.md). Development rent remains **UGX 5,000 per 30 fixed days, seven days’ grace, manual reconciliation; live collection disabled**.

## Implemented behavior

- Fresh owners manage teams, invitations, membership roles, ownership transfer and per-shop staff permissions through bounded private pages. Every membership mutation and invitation acceptance advances the shared merchant revision; new commands compare it after the merchant lock. Last-owner protection and permanent issuer-revocation rules remain authoritative.
- Invitation tokens stay in private local notifications and a password input on the acceptance page, never in addresses or team-list responses. Staff require both current membership and explicit shop grants. Setup guidance links catalogue, contacts, design, publication and tenancy to their existing protected workflows.
- Owner address changes require fresh authority, current version, reason and confirmation. Migration 011 backfills permanent slug reservations and a trigger maintains them for future provisioning and changes. Former slugs and immutable IDs resolve only after current public eligibility, then redirect to the canonical address. Reserved aliases cannot be stolen or deleted through SQL. New UUID-shaped slugs are rejected.
- Explicit `operations` permission and native MFA enable minimal shop queues and aggregate occupancy. Private details and commands require a separately claimed, audited `operator_operations_scopes` entry, fresh authentication for sensitive actions, and no active merchant self-membership. Existing support and application-finance scopes do not confer operations scope.
- Mall moves use the merchant lock and the same capacity advisory lock as provisioning, recheck current scope, compare shop version and refuse a full target mall. They preserve immutable identity, merchant, address, catalogue, design, financial history and moderation.
- Pause/resume commits an independent canonical operational hold and audit. All public shop, search, contact and ready-media consumers check it. Merchant republishing and tenancy recomputation cannot bypass a hold. Resume removes only that hold: valid publication, tenancy and moderation are still required.
- Finance exceptions list unsettled local workflow invoices only within the current operator’s claimed application-finance scope. Operations permission does not grant financial access. Lists use bounded 20-row pages; detail audit shows the latest 20 operations.

Ordinary seed permissions are unchanged. The repeatable local-only `npm run db:operations` command explicitly grants the verified existing fictional review operator; it prints no credentials. It was run after the main database upgrade. Native MFA and separate scope claims remain required.

## Checks and acceptance evidence

**160 tests passed:** 23 unit, 104 real PostgreSQL integration, 16 public-fixture browser and 17 core production-browser tests. Lint, strict types, formatting, documentation links, standalone web and independent worker builds passed. Dependency audit reported **zero vulnerabilities**, with no dependency or lockfile changes. The configured-secret artifact scan passed over **1,100 files / eight candidate values**, printing no values.

Eight new integration cases in [p8.test.ts](../../tests/integration/p8.test.ts) cover:

1. Address backfill/automatic registration, default operations denial, explicit grant and owner-only collections.
2. Owner/team isolation and a real same-version invitation race: only one command commits, without token metadata disclosure.
3. Native invitation acceptance, merchant revision and one-use behavior; ownership transfer permanently revokes outstanding issuer invitations.
4. Last-owner rollback, permission escalation denial and explicit staff shop grants.
5. Owner-only address changes, stale versions, immutable alias reservations, direct-SQL takeover/deletion rejection, old aliases and immutable-ID resolution.
6. Mandatory MFA, distinct scope and self-administration denial; scope revocation during a proven merchant-lock wait prevents the waiting pause and creates no hold.
7. A paid, published P8 shop with public contacts and ready media: pause revokes every consumer despite fresh-version republishing and tenancy recomputation; resume preserves moderation suspension; finance events remain unchanged; a reversal creates a scope-filtered exception.
8. Two merchants racing for one target-mall slot: one move commits, the other conflicts, while immutable identity, merchant and slug remain intact.

Three new browser cases in [zz-admin.spec.ts](../../tests/e2e-core/zz-admin.spec.ts) and [admin-mobile.spec.ts](../../tests/e2e-core/admin-mobile.spec.ts) exercise real native sign-in/MFA, owner invitation, native recipient acceptance, no-shop denial before grant, scoped catalogue access without finance, confirmed address changes and redirects, operator claim/pause/resume/move, retained audit, keyboard access, mobile overflow and axe checks.

All ten new protected HTTP methods are covered by the attack fixture:

| Path | Methods |
|---|---|
| `/api/workspace/merchants` | GET |
| `/api/workspace/merchants/[merchantId]/team` | GET, POST |
| `/api/workspace/shops/[shopId]/address` | POST |
| `/api/operator/malls` | GET |
| `/api/operator/shops` | GET |
| `/api/operator/shops/[shopId]/claim` | POST |
| `/api/operator/shops/[shopId]/operations` | GET, POST |
| `/api/operator/rent-exceptions` | GET |

Anonymous requests fail authentication. Foreign resources deny access; the owner collection returns only owned merchants. Sensitive team/operations HTML and Flight requests are denied before disclosure. Mutation origin checks remain enabled. Private responses retain no-store/no-referrer protections. The existing invitation acceptance method is reused and covered by the native browser journey.

The first expanded browser run exposed two issues: placing another status-bearing form on the existing profile page made its old status selectors ambiguous, and the new alias test assumed a shop was published after the preceding test intentionally unpublished it. Address editing now has a dedicated protected page, preserving the original profile workflow; the new journey explicitly republishes through the real owner API before checking redirects. The complete rerun passed all 17 core tests. An initial integration assertion reused a stale shop version; it now reads the current version before the second publication, and all 104 integration tests pass. These corrections do not weaken authorization or existing assertions.

## Upgrade and runtime

[010→011 migration evidence](X2-P8-ADMIN-MIGRATION.json) compares counts and sorted whole-row digests over all original columns of **26 existing business, permission and financial tables**. Existing fields, repeated migrate/seed behavior and the private application-credential file were preserved. Dataset: **1,506 shops, 150,004 products, 1,504 departments and one design revision**. Local migration time was **50 ms**; new address/operations tables are additional records. Applied migrations 001–010 remain unchanged.

[Runtime evidence](X2-P8-ADMIN-RUNTIME.json) verifies matching schema-011 web/independent worker, database/authentication readiness, the published fictional Annette shop and shoes search, with no private account email in public responses. Anonymous administration endpoints returned 401 with private no-store headers. `localRentWorkflow` is true; live financial operations and live notifications are false.

## Visual evidence

These screenshots were opened and inspected. They contain fictional development identities/shops and no authentication secrets. Historical screenshots from earlier packets are preserved separately.

- [Owner team, desktop](images/x2-p8-team-desktop.png): bounded member/shop/invitation records and labelled confirmed commands.
- [Scoped shop operations, desktop](images/x2-p8-operations-desktop.png): independent canonical status, mall selection, reason/confirmation and retained audit.
- [Owner team, mobile](images/x2-p8-team-mobile.png): keyboard focus, readable controls and no horizontal overflow.

The screenshots prove local layout/accessibility observations; automated axe checks do not establish complete accessibility certification. See [journey diagrams](../ILLUSTRATIONS.md).

## Remaining boundaries and handoff

This finishes the **local P8 administrative packet**, not the entire application or production release. Next is **P9 at the current Sol 6.1 Extra High setting**; R2 remains **6 Astra Extra High** for the final system/release review. No model switch is needed now.

Production accounting/arrangement policy, provider callbacks and mismatch case management, live notifications/storage, public signup, trust moderation/verification, privacy-governed exports/retention, analytics, AI and release/recovery remain separate obligations. Operational hold is not a financial grace extension. Current UI is bounded: 20-row pages and latest-20 audit; larger invoice/audit navigation and richer exception investigation remain master-plan work. No bulk action or unrestricted administrator bypass is introduced. Occupancy/race tests and a 50 ms local migration are not production capacity, downtime or backup/restore evidence. Fresh-task/Docker-volume restoration has not been independently verified.

Finished source, tests, screenshots and reports are committed and pushed together on the authorized implementation branch; use Git for the exact packet SHA. Private configuration, notification tokens, account files and browser traces remain ignored. Saved cloud setup instructions are a reviewable draft; review/save and Publish activate configuration.
