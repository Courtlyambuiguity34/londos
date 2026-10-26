# Official-source research and search refinements

Verified 26 October 2026 (Africa/Kampala). Branch
`feature/hosted-lifecycle-secure-2026-10-23`, continuing from `f2ff037`.

## Research and implemented result

The owner asked for searches and deeper documentation research after live
storefront access failed. The
[deeper review](../DEEP-COMPETITIVE-REVIEW-2026-10-26.md) records attempted search
routes, official Amazon/Etsy/MTN alternatives, Shopify architecture/search
documentation, Airbnb help, local marketplace material and Baymard UX research.
It maps the supported capabilities to Londos, separates current functionality
from remaining dependencies, and links each substantive source. No paywall or
bot challenge was bypassed, and private competitor infrastructure is not guessed.

The immediate implementation is **Refine results**: products/services and
merchant-provided availability, with individual applied-filter removal and
context-preserving clear actions. These are functional refinements over canonical
public shop discovery, not client filtering of one already-loaded page.

`PostgresSearch` validates both enum fields and qualifies shops before pagination.
A shop must have a matching non-archived product/service in a non-archived
department. Product hits satisfy those filters themselves; an unrelated product
elsewhere cannot incorrectly qualify a department hit. Shop-name matches can
still lead to the whole qualifying shop. Refined browsing without a query shows
a qualifying product/service and its exact detail link. It returns one card per
shop, not every matching product.

Existing publication, tenancy, moderation, operations, owned-media, current
price and cursor boundaries remain. A filter change starts at the first page;
a cursor from a different refinement scope is rejected. Default `all/all` keeps
the old cursor fingerprint and unfiltered behaviour. Saved-shop lookup still
uses those defaults.

The forms use native GET/disclosure controls and explicitly paired labels, and
work with JavaScript disabled. Search text, category, shop scope and refinements
survive relevant navigation. Controls reset to the current URL values when
filters change. Clear links omit the cursor, and an empty refined result offers
to retry without the refinements while keeping its other context.

## Verification actually executed

- Before edits: **4 existing database checks passed / 24 skipped**, covering
  search categories, cursors, product-match metadata and saved visibility.
- Final focused unit run: **38 passed** across refinements, saved-list bounds,
  preview discovery and search indexing. New checks cover strict enums, rejected
  collection/unsupported input, URL encoding and retained/cleared context.
- Entire affected `p6.test.ts` suite: **30 passed**. The two new scenarios cover
  current availability and kind changes, archived departments, suspended shops,
  shop/department/product matching, pre-pagination qualification across a
  24-shop fixture, complete deduplicated paging, changed-filter cursor rejection
  and default cursor compatibility.
- **5 distinct production-browser scenarios passed**, in two invocations. The
  first run passed the four existing discovery/save/share/contact/API cases and
  caught an implicit select-label problem in the new case. After using explicit
  label/control pairs, the new case passed separately. It also checks native
  forms with browser JavaScript disabled. These are five unique cases, not six.
- New controls passed axe WCAG2 A/AA and WCAG2.1 AA checks and horizontal-overflow
  checks at **1440, 390 and 320px**. Existing mall checks also include 900px.
  The browser uses real decoded normalized fixture images and current DB reads.
- Production web/standalone and independent worker/release bundles built.
  Direct TypeScript, full lint, changed-source formatting, whitespace and local
  documentation links were checked.
- Configured-value bundle scan passed for **1,873 files / 20 candidate values**.
  This checks exact configured values, not every possible secret or every live
  environment. The corresponding changed-file scan and documentation-link check
  were also run before committing.
- Documentation validation resolved **867 local links across 126 Markdown
  files**. The changed-file scan passed for **17 files / 13 distinct configured
  candidate values**, including both new images.

The fixture uses disposable local PostgreSQL, fictional identities/catalogue,
existing Londos illustrations and local notification records. No real email,
WhatsApp message, AI request, purchase or production database write occurred.
The production launcher is started by Playwright; native Windows installation,
live competitor checkout and a Render deployment were not exercised here.
Earlier broad release/recovery drills and already-completed theme audits were
not repeated. Previous screenshot files were restored unchanged after the
regression run; new evidence uses separate filenames.

## Screenshots

- [Desktop refinements](images/discovery-refinements-1440-2026-10-26.png)
- [Phone refinements](images/discovery-refinements-390-2026-10-26.png)

These show fictional local content and the intentional local-development notice.
They are not screenshots of real merchants or a newly deployed Render instance.

## Deployment

Deploy the updated hosted branch using the existing configuration. No new
environment variables, packages or SQL migration are required. Existing shops,
prices, ownership, publications, authentication and private workspaces are not
rewritten. Availability is supplied by the merchant; this does not reserve
inventory or enable product payment capture. Variant inventory, currency-aware
price filtering, suggestions, synced collections and checkout/fulfilment remain
separately scoped in the deeper review.

## Every file added or changed

This update adds seven files and changes ten; earlier evidence images remain
unchanged.

Added:

- `docs/DEEP-COMPETITIVE-REVIEW-2026-10-26.md`: deeper source review and priorities.
- `docs/evidence/SEARCH-REFINEMENTS-2026-10-26.md`: verification and inventory.
- `docs/evidence/images/discovery-refinements-1440-2026-10-26.png`: desktop evidence.
- `docs/evidence/images/discovery-refinements-390-2026-10-26.png`: phone evidence.
- `src/components/search-refinements.tsx`: native refinement form and clear action.
- `src/modules/discovery/refinements.ts`: enum contracts and safe shared URL builder.
- `tests/unit/search-refinements.test.ts`: bounds/enum and URL-state checks.

Changed:

- `docs/BUILD-STATUS.md`: current research/verification pointers.
- `docs/COMPETITIVE-EXPERIENCE.md`: links the expanded research while retaining the initial observations.
- `docs/X2-HANDOFF.md`: continuation instructions and behaviour to preserve.
- `src/app/discovery-experience.css`: scoped responsive controls and explicit field grouping.
- `src/app/search/page.tsx`: forwards the two scalar filter values to canonical discovery.
- `src/components/canonical-directory.tsx`: form, applied filters, reset links and pagination context.
- `src/components/search-form.tsx`: preserves refinements when changing search text.
- `src/server/discovery.ts`: validated pre-pagination filters and cursor scope.
- `tests/e2e-core/discovery-experience.spec.ts`: one new browser scenario and a bounded action timeout.
- `tests/integration/p6.test.ts`: two canonical filtering/pagination scenarios; earlier tests retained.
