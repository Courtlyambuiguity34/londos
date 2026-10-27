# Catalogue departments, deletion and recovery

27 October 2026. Based on `aa1a8ea` on
`feature/hosted-lifecycle-secure-2026-10-23`.

## Findings and behaviour

The screenshots show two archived Crops departments. Archived departments are
intentionally unavailable for new products, but the old empty state incorrectly
said to create a first department. A remembered department selection could also
refer to a department that was no longer available.

- Products now use the current active department list. Archived-only catalogues
  explain the situation and link to Departments, where **Activate** makes an
  existing department available again. Active/archived counts and selector hints
  explain the available choices.
- Department names are unique per shop, including archived departments. Database
  enforcement handles concurrent creates, renames, case, repeated whitespace,
  leading/trailing tabs and Unicode compatibility forms. Separate shops may use
  the same name. Existing duplicates receive distinct names such as **Crops (2)**;
  their identities, products, positions and existing links are preserved.
- Product and department rows have confirmed **Delete** actions. Department
  deletion moves its currently undeleted products to the recycle bin together.
  Public catalogue reads immediately exclude them through the existing hidden
  state rules. Missing destinations in a live shop keep the existing helpful
  unavailable page with `noindex`; this page uses HTTP 200 rather than a 404.
- **History & deleted items**, also reachable from a toolbar shortcut, lists
  restore deadlines, recent edits, before/after values and the actor. History and
  the recycle bin are paginated separately. They load only when opened.
- Recovery lasts **30 days**. Department recovery restores the entire deletion
  batch, including products beyond the visible page. Products deleted separately
  beforehand stay deleted. An individual product requires its active department
  before restoration. Name/link conflicts, missing photos, current versions,
  permissions and catalogue limits are checked; failure rolls back the operation.
- An edit can be reverted to its previous values as a new version, preserving
  the journal. Older edits and deletion/restoration events remain visible until
  their retention period expires. A deleted item must first be restored from the
  bin. History predating this feature cannot be reconstructed.

The database decides deadlines even when the worker is stopped. Unexpired journal
records cannot be updated or deleted. Bounded maintenance removes expired
snapshots and scrubs expired deleted products/departments to non-public identity
stubs. Customer-request/financial references remain intact. The photo library and
other records retain their separate lifecycle rules. Restoration and reversion
can affect an already published shop immediately.

## Local verification

Only disposable PostgreSQL databases, fictional accounts and generated fixture
photos were used. No hosted records, environment values or mail settings changed.

- Production build, standalone packaging and worker/release bundles: passed.
- Full unit suite: **306 passed** across 33 files. One older provider-wire test
  was aligned with the earlier deliberate normalization of new section anchors;
  invalid existing section IDs remain rejected. No provider runtime code changed.
- Database checks: **101 passed** across catalogue recovery, P5 catalogue/media,
  core authorization, P13 design and embedded-worker startup suites. The new
  recovery suite contains 13 scenarios, including migration from 036, repeat
  migration, duplicates/concurrency, confirmation, stale versions, isolated shop
  access and substituted IDs, atomic rollback, a 25-product recovery batch,
  immutable/expired history and retaining customer enquiry references.
- Browser checks: **15 passed** across catalogue feedback, P5 desktop/mobile and
  storefront themes. The updated eight catalogue scenarios were then rerun
  successfully after adding anonymous published-page deletion/restoration checks
  and confirmation/origin rejection checks. Archive activation, two-department
  selection, duplicate rejection, cancel/confirm deletion, restore and price edit
  reversion were exercised through the UI.
- Recovery layout: no horizontal overflow at **1440, 390 or 320 px**; no
  WCAG A/AA violations detected by the configured axe checks at those widths.
- Type checking, changed-file ESLint, formatting, document links and whitespace:
  passed. The configured-value scan of browser assets passed; it is an exact-value
  leakage check, not a complete security audit.

Private local logs use the `.local/catalogue-recovery-` prefix. Historical image
captures overwritten by regression tests were restored; new captures are below.

- [Phone recovery view](images/catalogue-recovery-390-2026-10-27.png)
- [Desktop recovery view](images/catalogue-recovery-1440-2026-10-27.png)
- [Shopkeeper instructions](../SHOPKEEPER-QUICK-START.md)

## Deployment and changed files

Apply **037_catalogue_recovery.sql before serving this version**. On the existing
phone-managed Render setup, `LONDOS_MIGRATE_ON_START=true` runs pending migrations
before bootstrap/web startup. Deployments using a separate migration/release step
apply it there instead. The startup fallback remains explicitly enabled rather
than becoming a new default. No new environment keys, dependencies or Docker
commands are introduced.

| Files                                                                                                                           | Purpose                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `migrations/037_catalogue_recovery.sql`                                                                                         | Recovery metadata, immutable journal, normalized unique department names and preservation of legacy relationships. |
| `src/server/catalogue.ts`                                                                                                       | Active/deleted reads, unique-name errors, version checks and journalled catalogue mutations.                       |
| `src/server/catalogue-journal.ts`                                                                                               | Scoped snapshots and batched journal inserts.                                                                      |
| `src/server/catalogue-recovery.ts`                                                                                              | Scoped history/bin reads, transactional delete/restore/revert and bounded expiration maintenance.                  |
| `src/modules/catalogue-history.ts`                                                                                              | Shared command validation and response types.                                                                      |
| `src/app/api/workspace/shops/[shopId]/catalogue/history/route.ts`                                                               | Authenticated history and recovery API.                                                                            |
| `src/app/api/workspace/shops/[shopId]/departments/[id]/route.ts`, `src/app/api/workspace/shops/[shopId]/products/[id]/route.ts` | Confirmed deletion endpoints using existing authentication, origin and request-budget guards.                      |
| `src/server/jobs/handlers.ts`                                                                                                   | Invoke retention maintenance through the existing worker.                                                          |
| `src/components/catalogue-workspace.tsx`                                                                                        | Connected selector, activation/duplicate feedback, delete controls and history entry points.                       |
| `src/components/catalogue-history.tsx`, `src/app/editor-workflows.css`                                                          | Phone/desktop recycle bin, deadlines, edit comparisons and reversion controls.                                     |
| `tests/integration/catalogue-recovery.test.ts`, `tests/e2e-core/catalogue-feedback.spec.ts`                                     | Recovery, migration, tenant isolation and browser regression coverage.                                             |
| `tests/unit/p12.test.ts`                                                                                                        | Correct the stale new-anchor expectation while retaining existing-ID rejection.                                    |
| `docs/SHOPKEEPER-QUICK-START.md`, `docs/BUILD-STATUS.md`, this review and two new PNGs                                          | Merchant guidance, deployment notes and evidence.                                                                  |
