# Clean shop addresses — 25 October 2026

Branch: `feature/hosted-lifecycle-secure-2026-10-23`, baseline `eb41829`.
Earlier implementation and evidence were preserved.

## Result

The reported legacy pattern
`/shops/nguzza-agricultural-suppliers-68a40e06-65f8-4e07-a5d5-61c7ed87d799`
becomes `/shops/nguzza-agricultural-suppliers` when migration 036 runs and that
clean address is not reserved by another shop.

- New allocation uses the readable business name and never appends a UUID or
  automatic numeric suffix. Digits that belong to an actual business name are
  preserved; this is not a rule requiring merchants to rename their businesses.
- A collision returns HTTP 409. The initial-invoice credit and promo forms offer
  an optional distinct address, such as `nguzza-agricultural-suppliers-mbale`.
  Changing that field does not change the business name. A failed conflicting
  settlement rolls back credits, receipts, invoice changes and provisioning.
- Current slugs have a unique database constraint, and the immutable
  `shop_addresses` primary key reserves all current and former slugs. Allocation
  and owner changes share a transaction lock; old addresses cannot be stolen.
- New/changed addresses reject UUID and compact-ID tails. Owners still need
  their existing membership, fresh authentication and current record version.
- Migration **036_clean_legacy_shop_addresses.sql** strips only a suffix that
  exactly matches that shop's own ID. It locks merchants before the shared
  address lock, preserves identity/catalogue/tenancy/financial data, increments
  the shop version and writes a system audit event. Migrations 001–035 are
  unchanged. A rerun does not rename twice or duplicate audit events.
- If the short address is another shop's current or historical address, the
  migration leaves that row unchanged. Service configuration warns about
  remaining legacy addresses; the owner gets a clean suggestion in Edit address
  and can choose distinct meaningful words. No fabricated location or new ID is
  assigned. The conflict must be resolved by choosing an available name.
- Old eligible public links permanently redirect to the latest canonical slug.
  An unpublished/restricted shop remains unavailable through every alias;
  cleaning its address does not publish it or override rent/moderation gates.

## Applying on Render without a terminal

Deploy this branch and apply migration 036 before serving the new version;
readiness now requires it. The existing migrator verifies prior checksums and
applies it once. If using the phone-only upgrade path, set the existing web
setting **`LONDOS_MIGRATE_ON_START=true`**, using the reviewed migration-capable
PostgreSQL credential, and redeploy. If already enabled, no new setting is needed.
Check for `release.migration` with `result: passed`, then restore the usual
least-privilege runtime configuration after the upgrade. No secret value, database
URL, role, domain setting or collection account was changed by this task.

See [Render setup](../RENDER-SETUP.md) and [address/operations guide](../HOSTED-BILLING-AND-OPERATIONS.md).
The startup integration actually ran the compiled release entry from a pre-024
database, cleaned a legacy shop URL during startup, preserved its alias and
confirmed that a second startup did not repeat the update.

## Checks actually executed

| Scope | Result |
| --- | --- |
| `npm test -- tests/unit/shop-storefront.test.ts` | 5 passed; normalization, identifier rejection and legitimate business digits included. |
| Selected new address migration and hosted allocation/settlement regressions | 5 passed, 7 skipped across `shop-addresses` and `hosted-lifecycle`; skips are not passes. |
| Relevant existing free-period promotion regression | 1 passed, 30 skipped in `p8`. |
| Compiled bootstrap and startup-migration suites | 4 passed. The strengthened startup scenario then passed again with explicit 036/clean-slug/alias/restart assertions. |
| Production browser `shop-addresses.spec.ts` | 1 passed: exact reported suffix cleanup; HTTP 308; clean page HTTP 200; owner collision denial; new readable owner address; old aliases redirect directly; ID reintroduction HTTP 422; all aliases HTTP 404 after unpublish. |
| Production build | Passed, including TypeScript, standalone assets and worker/migrator/bootstrap bundles. |
| Final static checks | Full lint, TypeScript, formatting for all 15 changed code files and whitespace passed. 800 local links resolve across 117 Markdown files. Configured-secret artifact scan passed: 1,843 files/20 candidates; exact changed-file scan passed for all 21 files. |

Selected integration coverage totals **10 unique passing scenarios**, with the
startup repeat counted once. These are targeted checks, not a rerun of all earlier
passed suites. No unrelated physical recovery drill, live email or AI call ran.
Mutating tests used guarded disposable loopback databases and fictional users.

A read-only pre-deployment probe returned **404 for both supplied legacy and
proposed clean public URLs** on `https://londos.onrender.com`. That does not
establish whether a shop exists privately, is unpublished/restricted, or whether
the hosted database has received this migration. No live database migration or
successful Render rollout is claimed by the local verification.

## File inventory

Total: **21 files** (5 added, 16 modified). No deletions.

| Change | Path | Purpose |
| --- | --- | --- |
| Modified | `docs/BUILD-STATUS.md` | Record current 036 readiness and the address correction evidence. |
| Modified | `docs/HOSTED-BILLING-AND-OPERATIONS.md` | Document no generated suffixes, explicit collision resolution, aliases and migration behavior. |
| Modified | `docs/RENDER-SETUP.md` | Explain the existing phone-only startup migration option for 036. |
| Modified | `docs/X2-HANDOFF.md` | Point continuation to this correction and current schema contract. |
| Added | `docs/evidence/SHOP-ADDRESSES-2026-10-25.md` | Record the change, verified scope, live-probe limit and complete inventory. |
| Added | `migrations/036_clean_legacy_shop_addresses.sql` | Safely clean available legacy own-ID suffixes; preserve aliases and audit each update. |
| Modified | `playwright.core.config.ts` | Register the focused shop-address browser case. |
| Modified | `src/app/shopkeeper/shops/[shopId]/address/page.tsx` | Show a safe readable suggestion and guidance for unresolved legacy collisions. |
| Modified | `src/components/admin-controls.tsx` | Validate owner-selected readable addresses before submission. |
| Modified | `src/components/lifecycle-controls.tsx` | Add optional readable initial-shop addresses and explain conflicts in credit/promo flows. |
| Added | `src/modules/shop-address.ts` | Share readable-address/identifier validation and legacy suffix detection. |
| Modified | `src/server/administration.ts` | Reuse the stricter address validator; keep owner/freshness/version/history checks. |
| Modified | `src/server/db/schema-contract.ts` | Require migration036 before current readiness passes. |
| Modified | `src/server/rent.ts` | Carry explicit address choices through atomic final coverage/provisioning. |
| Modified | `src/server/services/status.ts` | Warn authorized operators about legacy addresses still needing human collision resolution. |
| Modified | `src/server/shop-address.ts` | Reject taken names under the shared lock without adding identifiers/numeric suffixes. |
| Added | `tests/e2e-core/shop-addresses.spec.ts` | Exercise cleanup, HTTP308 aliases, owner collisions, invalidID rejection and unpublished404 gates. |
| Modified | `tests/integration/hosted-lifecycle.test.ts` | Verify no suffix generation, historical reservations and rollback/retry with explicit readable settlement address. |
| Added | `tests/integration/shop-addresses.test.ts` | Verify data migration, uniqueness, aliases, prior checksums and idempotence. |
| Modified | `tests/integration/startup-migration.test.ts` | Prove compiled web startup applies036 and cleans once while retaining the old alias. |
| Modified | `tests/unit/shop-storefront.test.ts` | Add identifier rejection and legitimate business-name digit cases. |
