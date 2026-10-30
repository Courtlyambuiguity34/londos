# Merchant product entry and shop organisation — 29 October 2026

Baseline: `e8e7a69` on `feature/hosted-lifecycle-secure-2026-10-23`.

## Research and judgment

This review focuses on Alibaba, Amazon and Shopify, continuing the preceding
comparison. Public first-party documentation and product-tool pages were used;
authenticated competitor merchant accounts were not available, and no listings
were submitted to their platforms. The observations below describe documented
workflows rather than measured task-completion times or a private-dashboard audit.

| Platform and sources                                                                                                                                                                                                                                                                                      | What helps merchants                                                                                                                                                   | Assessment against Londos                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shopify: [adding and updating products](https://help.shopify.com/en/manual/products/add-update-products), [collection layout](https://help.shopify.com/en/manual/products/collections/collection-layout), [product search and filtering](https://help.shopify.com/en/manual/products/searching-filtering) | Reusing a similar product reduces repetitive entry. Product-list filters help merchants find records. Collections provide controls over customer-facing product order. | These are useful advantages. Londos had no duplicate-to-editor action or private catalogue filtering, and its product/departments forms hid ordering positions. Add these workflow tools without introducing Shopify's entire collections model.                                                                 |
| Amazon: [Seller Central tools](https://sell.amazon.com/tools/seller-central), [product-listing guide](https://sell.amazon.com/blog/amazon-product-listings)                                                                                                                                               | A clear product-entry point supports creating a listing or matching an existing catalogue item; bulk uploads and richer listing attributes support larger catalogues.  | Londos has a simpler merchant-owned catalogue rather than Amazon's shared catalogue/offer model. Improve repeat entry and retrieval now. Copying identifier, offer, variation, shipping and inventory forms without the corresponding data model would make Londos more confusing.                               |
| Alibaba: [Product Tools](https://seller.alibaba.com/pages/producttools/index.html), [seller features](https://seller.alibaba.com/features)                                                                                                                                                                | Reusable media, product groups, catalogue management and storefront tools support publishing and organising a supplier's range.                                        | Londos already has a reusable image library, departments, themes, section controls and previews. Department creation should be available within product entry; arranging departments/products should not require understanding hidden position values. No supplier-verification or exposure claims are imported. |

The larger platforms provide more mature catalogue tooling. They are not
uniformly simpler for a small merchant: shared-catalogue matching, wholesale
attributes and complex variant/inventory forms solve needs that Londos does not
yet model. Londos should make its actual tasks easier rather than copy every
field. No claim is made that these changes establish overall merchant-platform
parity or increase sales by a measured amount.

## Existing capabilities retained

Londos already separates products, departments, images, contact settings,
requests and recovery history. Entered product fields survive switching those
catalogue panels. Its design editor already offers themes, section move-up/down
controls, private previews, and an explicit publish step. These are retained.
This change does not replace section design or automatically publish a shop.

## Changes implemented

1. **Create a department in the product form.** An inline group creates and
   selects a department while retaining product name, description, price,
   currency and other entered details. It uses the existing validated write path,
   so duplicate names, invalid links, access and quotas still apply. The optional
   readable link can be entered for names that do not generate a usable address.
   It is not a nested HTML form. Pressing Enter in its fields creates the
   department instead of submitting the surrounding product.
2. **Duplicate into the editor.** A product or service can populate a new form
   with its description, exact price/currency, type, department and photo.
   The source remains unchanged and no record is created until Save. The copy
   starts hidden, with a new name and regenerated link, so a merchant reviews
   availability before offering it. This is a new independent listing, not a
   stock-linked product variant or a new draft/publishing state.
3. **Save and add another.** The saved product is confirmed through the existing
   API. The next empty form remembers department, currency and product/service
   type. Ordinary saves retain their existing reset/confirmation behavior, and
   failed writes retain entered fields. New products append using the maximum
   position across the shop's entire non-deleted catalogue, fixing the previous
   dependence on which twenty-product page was loaded.
4. **Find products in the whole catalogue.** Merchants can search literal name
   fragments and filter by department/status. PostgreSQL applies these conditions
   before pagination, not to the current twenty rows in the browser. The form
   resets pagination when filters change, preserves them between pages and
   offers a clear action. Searching never resets an in-progress product form.
5. **Arrange customer-facing order.** Active departments have move-up/down
   controls. Selecting one active department, with name/status filters cleared,
   exposes the equivalent controls for its non-archived products. Moves use the
   full server order, so they cross page boundaries and handle equal legacy
   positions. Archived and deleted records are excluded from arrangement.
   Department navigation and department-based product displays follow this
   order; manually selected home-page products/sections keep their design order.
6. **Show the next setup task.** The existing checklist includes creating the
   first department and links directly to the first incomplete permitted task.
   Existing rent, access, preview and publication rules remain authoritative.
7. **Protect unfinished entry.** Replacing a modified product form asks before
   discarding it. Reloading/closing the browser registers the usual unsaved-change
   warning. Ordinary catalogue panel changes keep the form mounted. This is not
   persistent draft storage or a universal interceptor for all client navigation.

## Integrity and implementation

The arrangement endpoint checks catalogue permission and the source version
inside the existing merchant transaction lock. It reads the current shop and
department scope, exchanges adjacent visible records and assigns consistent
integer positions. Only rows whose positions change receive new versions.
Before/after snapshots share a history batch and the operation receives an audit
record. All changes commit together; stale or cross-merchant writes fail. Moving
past an edge performs no write.

First-time arrangement can normalise multiple legacy positions; after that,
ordinary adjacent moves normally update two rows. Catalogue limits remain the
existing 100 departments / 10,000 products. No new database table, package,
environment key, provider or migration is required. An integration case exercises
first-time arrangement of 10,000 tied-position products and checks their order,
unique positions and unchanged listing data. This is a local capacity check,
not a production performance guarantee.

CSV imports, bulk commercial editing, stock-linked variants, automated collections
and shared product catalogues remain separate projects requiring explicit data,
validation, preview and rollback behavior. Existing image upload/processing and
design/publish workflows continue to work.

## Verification

Implementation and verification completed **30 October 2026**; research and
captures began on 29 October.

- Production build, TypeScript checks and standalone/worker packaging passed.
  Final ESLint passed with zero allowed warnings.
- Unit suite: **310 passed** across 35 files. New contract checks reject invalid
  filters, control characters, unsupported operations and unbounded inputs.
- Catalogue/contact and catalogue recovery integration suites: **41 passed** in
  disposable local PostgreSQL databases. New cases cover filtering before
  pagination, literal search characters, exact prices, global append positions,
  cross-page ordering, tied positions, stale/foreign writes, concurrent moves,
  shared history batches, unchanged listing data and public department order.
  The 10,000-product first-arrangement case passed, as did existing recovery and
  revert behavior.
- Core browser suites (`catalogue-feedback`, `p5`, `workspace-experience` and
  `audit`): **21 passed**. New cases exercise inline department creation without
  losing product fields, repeat entry with preserved defaults, duplication
  without changing the source, later-page search, product/department arrangement,
  origin/authentication rejection and confirmation before discarding edits.
  Existing publishing, deletion/recovery, image processing, customer requests,
  workspace permissions and setup checks pass.
- Product-entry views were checked at 320, 390 and 1280 pixels, with applicable
  automated WCAG A/AA and horizontal-overflow assertions. Phone product-entry
  and department-order captures were visually inspected. Automated checks do not
  replace a complete accessibility audit or native phone-app testing.
- Configured-secret artifact scan passed for **1,934 files / 38 candidate values**.
  This checks exact configured values rather than every possible secret.
- Changed source, test and Markdown files pass Prettier; unrelated pre-existing
  formatting debt is outside this change. Documentation links and
  `git diff --check` pass.

Fictional merchant captures:

- [Product entry — desktop](images/merchant-product-entry-1280-2026-10-29.png)
- [Product entry — phone viewport](images/merchant-product-entry-390-2026-10-29.png)
- [Department ordering — phone viewport](images/merchant-department-order-390-2026-10-29.png)

Tests regenerated older evidence captures. Those copies were preserved outside
the repository and the dated originals restored. Only this change's new captures
are included. No production catalogue or competitor seller account was changed.
