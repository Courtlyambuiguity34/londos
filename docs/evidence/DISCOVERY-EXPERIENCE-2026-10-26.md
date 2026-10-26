# Discovery and merchant-contact experience

Verified 26 October 2026 (Africa/Kampala). Branch
`feature/hosted-lifecycle-secure-2026-10-23`, based on `60e5025`.

## Review and resulting behaviour

The [reference review](../COMPETITIVE-EXPERIENCE.md) distinguishes pages actually
inspected from blocked/incomplete responses. CampusPlug informed the adjacent
product/contact layout; Jumia/Jiji informed search and current price visibility;
Shopify informed hierarchy and a separate merchant invitation. The requested
Airbnb direction informed original image-led cards, independent Save controls
and concise metadata. Airbnb's listing stream, Amazon, MoMo and Etsy were not
available for a complete live card/workflow review. No competitor artwork or
commercial theme was copied.

The canonical database-backed mall has a search-led entrance, horizontal
category navigation, active filters, paged results and responsive shop cards.
One card links to the exact matched product/department or the shop. Its Save
button is separate from the link; an image error never creates a nested button
or blocks the link. Product matches expose current canonical name, kind, price
and availability and prefer their eligible assigned image over the shop cover.
Ordinary shop browsing retains published-cover precedence.

Changing categories now preserves the shop-scoped search. Clearing a category
retains the query and scope, and a failed shop-scoped query offers a way to
browse that shop without the failed query. Keyset cursors remain bound to their
query/category/shop and, when supplied, the bounded saved-ID set.

Save up to 40 shops on the browser. Only IDs are persisted; no name, photo,
email, auth token or visit history is stored by this feature. `/saved` checks
the current canonical public records again via a body-bounded, strict JSON,
same-origin endpoint. Two bounded pages cover the maximum list. It has a shared
300-request/minute budget rather than trusting user-supplied forwarded IPs.
Unavailable IDs are neither named nor returned; keeping an ID does not grant
access. Storage failure and lookup failure have distinct feedback, retry and
clear controls. Other tabs update through storage events; other browsers/devices
have separate lists. Privacy text explains these choices.

Public shop/product sharing uses native Web Share where supported, then
clipboard, then a labelled selectable link. Only a server-generated public shop
or product path is shared. Query strings, fragments and private preview paths
are excluded. A cancelled native share does not trigger an unwanted clipboard
fallback. Private previews have no save/share controls.

Product details put the actual enabled merchant contact methods beside the
item, preserve payment/fulfilment information, and add product context to the
WhatsApp link. The phone shortcut stays visible and leads to those methods;
the footer has room to remain readable above it. Enquiries remain enquiries,
not completed orders, and Londos still does not collect product payments.

## Additional correction found by the existing suite

The previous automatic catalogue fallback also ran after an unsupported saved
design had failed validation. `public-shop.ts` now separates parse success from
the empty fallback. Only a valid saved design receives automatic catalogue
sections. An invalid design has no rendered product catalogue, including a
direct product destination. Valid narrative-only designs and unknown stored
theme IDs retain their intended behaviour. The existing legacy-design safety
test caught this regression; it was fixed rather than weakening the assertion.

## Executed checks

- Baseline: 44 discovery, indexing and theme unit tests passed. The first
  sandboxed invocation hit `spawnSync EPERM`; the permitted retry passed.
- Final focused unit run: **46 passed** across saved-list inputs, preview
  discovery, search indexing and theme contracts.
- Entire affected `p6.test.ts` PostgreSQL suite: **28 passed**, including current
  product-match prices/media, visibility exclusions, strict bounds, private
  previews, publication, contact/media safety and keyset pagination.
- **Six distinct browser scenarios passed** against the compiled production
  launcher and disposable local PostgreSQL. Four are new discovery/saved/share
  scenarios; two are existing six-theme and uploaded-image publication
  regressions. Final verification used a five-scenario invocation (four passed,
  one navigation assertion read the pre-navigation URL), followed by a passing
  rerun after making that assertion await navigation. The uploaded-image case
  passed separately. The later product viewport recapture overlaps these counts.
- Phone/desktop layouts were checked at 320, 390, 900 and 1440px on the mall.
  The product page and saved list also received phone/desktop checks. Relevant
  rendered pages passed WCAG2 A/AA and WCAG2.1 AA axe checks with no violations.
- Browser cases exercise actual normalized-image decoding, broken-image
  fallback plus keyboard navigation, scoped empty-search recovery, save/remove,
  reload persistence, cross-tab synchronisation, independent browser state,
  suspension, blocked storage, lookup503/retry, clipboard/manual/cancel paths,
  exact product contact links, visible phone shortcut, cross-site rejection,
  strict/oversized inputs and a 24-shop saved response spanning two pages.
- Production web/standalone and independent worker/release bundles built.
  Direct TypeScript, full lint, formatting, whitespace and local documentation
  links were checked. The configured-value artifact scan passed for **1,877
  files / 20 configured candidate values**; this is an exact-value scan, not a
  general proof that no possible secret exists.
- Documentation validation resolved **857 local links across 124 Markdown
  files**. The corresponding task-file scan passed for **36 files / 13 distinct
  configured candidate values**, including the new screenshots.

Initial new test-fixture omissions and an alert selector ambiguity were
corrected. Tests use disposable databases, fictional identities and local
notification records. They do not send real email/WhatsApp messages, perform
purchases, use remote AI, alter live shops or deploy to Render. The existing
production launcher is exercised; native Windows installation is not re-tested
or changed by this task. Historical recovery/large release drills were not rerun.

## Screenshots

These are fictional local fixtures using existing Londos illustrations, plus a
real normalized upload of a generated colour image in the existing publication
regression. They are not merchant photographs. The development notice belongs
to the local test configuration; this update does not change deployment modes.
Earlier theme screenshots are preserved byte-for-byte rather than replaced by
regression-test output.

- [Mall desktop](images/discovery-mall-1440-2026-10-26.png)
- [Mall phone](images/discovery-mall-390-2026-10-26.png)
- [Product-match search](images/discovery-product-search-mobile-2026-10-26.png)
- [Saved shops desktop](images/discovery-saved-desktop-2026-10-26.png)
- [Saved shops phone](images/discovery-saved-mobile-2026-10-26.png)
- [Product and contact desktop](images/discovery-product-desktop-2026-10-26.png)
- [Product contact phone viewport](images/discovery-product-mobile-2026-10-26.png)
- [Uploaded cover on mall desktop](images/mall-shop-cover-desktop-themes-2026-10-26.png)
- [Uploaded cover on mall phone](images/mall-shop-cover-mobile-themes-2026-10-26.png)

## Deployment and remaining scope

Deploy this branch through the existing Render setup. No new dependency,
credential, environment variable, database migration or automatic seed is
needed. Existing publication, tenancy/moderation/operations gates remain in
force; an unpublished shop does not become public by installing this update.

Saved shops require browser JavaScript/storage and do not synchronise accounts
or devices. Native sharing depends on browser/platform support; the selectable
link remains the final fallback. This is a tested improvement to discovery and
merchant contact, not a claim of complete Shopify/Amazon feature parity or a
verified live deployment. See the review for separately scoped payment, stock,
delivery, review and offer capabilities that need their own implementation.

## File inventory

The inventory below lists all **22 added and 14 changed files** in this update. Private logs,
reference-page downloads, `.env.local`, browser traces and build output stay
ignored. No SQL migration or environment template changed.

### Added

- `docs/COMPETITIVE-EXPERIENCE.md`: observed reference strengths, limitations and scope.
- `docs/evidence/DISCOVERY-EXPERIENCE-2026-10-26.md`: this evidence and inventory.
- The nine PNG screenshots linked above in `docs/evidence/images/`.
- `src/app/api/public/saved-shops/route.ts`: bounded public lookup with fresh eligibility.
- `src/app/saved/page.tsx`: no-index saved-list page.
- `src/app/discovery-experience.css`: scoped discovery, saved-list and product/contact styling.
- `src/components/discovery-shop-card.tsx`: image-led linked card and current product match.
- `src/components/save-shop-button.tsx`: independent, accessible save/remove action.
- `src/components/saved-shops.tsx`: current saved records, loading/retry/empty/clear states.
- `src/components/share-shop-button.tsx`: public native/copy/manual share paths.
- `src/modules/discovery/saved-contract.ts`: strict list bounds and safe storage decoding.
- `src/modules/discovery/saved-store.ts`: browser-only IDs and tab synchronisation.
- `tests/unit/saved-shops.test.ts`: malformed, oversized and authority-bearing input rejection.
- `tests/e2e-core/discovery-experience.spec.ts`: four functional/accessibility browser scenarios.

### Changed

- `docs/BUILD-STATUS.md`, `docs/X2-HANDOFF.md`: current evidence pointers; history retained.
- `playwright.core.config.ts`: registers the new browser file.
- `src/app/layout.tsx`: imports the scoped stylesheet.
- `src/app/privacy/page.tsx`: describes optional browser-local saved shops and removal.
- `src/components/canonical-directory.tsx`: entrance, cards, category/search context and empty states.
- `src/components/canonical-shop.tsx`: public save/share, contextual contacts and phone shortcut.
- `src/components/icon.tsx`: local heart/share SVG paths.
- `src/components/mobile-navigation.tsx`, `src/components/site-chrome.tsx`: saved-list navigation.
- `src/components/search-form.tsx`: shop-specific search labels and placeholder.
- `src/server/discovery.ts`: bounded saved-ID scope, current matched-product fields/image precedence.
- `src/server/public-shop.ts`: valid-design-only fallback; invalid designs remain closed.
- `tests/integration/p6.test.ts`: two discovery/visibility checks; earlier assertions retained.
