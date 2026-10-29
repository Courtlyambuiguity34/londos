# Alibaba, Amazon and Shopify benchmark — 29 October 2026

Baseline: `bc4c971` on `feature/hosted-lifecycle-secure-2026-10-23`.

## Assessment

**Londos is not currently at these platforms' level of commerce capability.**
It overlaps with them in product discovery and merchant storefronts. Its current
strength is bringing independent shops together while preserving each shop's
identity, catalogue and direct customer relationship. That is a credible product
position, but it is not equivalent to operating a large transactional marketplace.

The three benchmarks also serve different jobs. Alibaba.com supports business
sourcing; Amazon's retail store supports consumer shopping; Shopify provides
merchant commerce infrastructure, with additional discovery channels. Treating
them as identical competitors would produce the wrong roadmap. This review does
not establish market-share rankings, conversion rates or comparative reliability.

## First-party sources and access limits

- [Alibaba home](https://www.alibaba.com/) and
  [Buyer Central](https://buyer.alibaba.com/) describe sourcing and supplier
  discovery. The public [RFQ entry](https://rfq.alibaba.com/rfq/rfqForm.htm) and
  [seller explanation](https://seller.alibaba.com/learningcenter/content/detail/PX2U9ID5.htm)
  describe buyer requirements and supplier responses. A marketplace RFQ is sent
  to Alibaba's sourcing system; it is broader than contacting one merchant.
- Alibaba's [Trade Assurance explanation](https://buyer.alibaba.com/page/tradeassurance/buyer/story.html)
  ties its protection to its online order and payment process. A contact button
  or an assurance badge alone cannot provide that protection.
- [Amazon's retail home](https://www.amazon.com/) presented a bot verification
  page in this environment. No challenge was bypassed. Amazon's own
  [shopping-tools guide](https://www.aboutamazon.com/news/retail/best-amazon-shopping-tips)
  describes lists, returning to shopping, item comparison and unit-price
  comparison. Its [Lists guide](https://www.aboutamazon.com/news/retail/amazon-wish-list)
  explains saving and sharing products. These first-party descriptions, rather
  than a successfully exercised Amazon checkout, support the findings below.
  Amazon's [FBA explanation](https://sell.amazon.com/fulfillment-by-amazon)
  describes outsourced storage, picking, packing, shipping, returns and customer
  service. This illustrates why matching its interface does not reproduce its
  fulfilment capability.
- [Shopify home](https://www.shopify.com/) presents its merchant platform.
  [Related-product guidance](https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-recommendations)
  explains recommendations, substitutions and published/available product
  eligibility. Its [order-management documentation](https://help.shopify.com/en/manual/fulfillment/managing-orders)
  covers payment, fulfilment, editing, returns and refunds.
  Its [inventory documentation](https://help.shopify.com/en/manual/inventory-and-locations)
  also describes quantity tracking, locations, transfers and purchase orders.

Public pages and official documentation were inspected. No competitor merchant
account, private dashboard, paid subscription, payment, RFQ posting or completed
order was exercised. Feature availability can depend on region, plan, account,
app and theme. No competitor assets, copy or layouts were incorporated into Londos.

## Where the benchmarks are ahead

| Customer or merchant need                         | Benchmark evidence                                                                                  | Londos before this change                                                                                                               | Decision                                                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compare specific products before deciding         | Amazon documents comparison and product lists.                                                      | Saved shops and price filters exist, but no product comparison.                                                                         | Implement a bounded, shareable comparison using current canonical listings.                                                                         |
| Find a relevant alternative without starting over | Shopify supports related and complementary products.                                                | Product pages offer a link back to the shop, but no immediate alternatives.                                                             | Show available listings of the same kind from the same department and merchant. Label the rule plainly.                                             |
| Explain a purchase requirement to a supplier      | Alibaba's sourcing and RFQ flows preserve buyer requirements.                                       | The backend accepts a product reference, but the public form always sends `null`; the merchant inbox omits product context.             | Carry an eligible product into the enquiry, display it before submission and identify it in the merchant inbox. This remains a single-shop enquiry. |
| Complete and manage a purchase                    | Alibaba documents protected online orders; Shopify documents payment and fulfilment workflows.      | Shop contacts, enquiries and merchant terms exist; Londos does not process shop purchases.                                              | A material capability gap. Build a real order and payment project before introducing checkout or buyer-protection claims.                           |
| Manage stock and commercial offers                | The platforms support richer product and transaction workflows.                                     | Listings have advertised prices and available/unavailable status; no quantity inventory, stock reservation or binding quote acceptance. | Requires catalogue units/variants, inventory rules and an order state machine. A quantity field by itself would not close the gap.                  |
| Know fulfilment and return outcomes               | Transactional commerce includes fulfilment and return workflows; Shopify documents them explicitly. | Merchant collection/delivery/payment information is displayed, but there is no platform shipment or refund lifecycle.                   | Keep information truthful. Carrier events, refunds, customer support and merchant obligations need operational ownership.                           |
| Trust reviews and merchant promises               | Alibaba's documented protection is connected to qualifying transactions.                            | Moderation, reporting and public visibility controls exist. They do not constitute transaction insurance or verified-purchase reviews.  | Retain safeguards; do not manufacture endorsements, ratings, delivery dates or guarantees.                                                          |
| Operate and grow a store                          | Shopify presents checkout, inventory, fulfilment, marketing and an extension ecosystem.             | Londos has themes, design/publishing tools, catalogue recovery, teams, contacts and an enquiry inbox.                                   | Preserve these working tools. Their existence does not demonstrate equivalent merchant automation or ecosystem depth.                               |

## Implemented changes

### Product comparison

Customers can select up to four products or services from product cards, product
pages and matched search results. The main navigation, mobile menu and footer
provide a comparison entry. Only bounded product identifiers are stored in this
browser; selections synchronise between tabs and can be removed or cleared.
Storage failures and the selection limit produce actionable feedback. This list
is a small decision aid, not a synced account wishlist.

The shareable `/compare?products=…` page reads current public product details
directly from PostgreSQL on each load. It shows merchant, advertised listing
price and currency, availability, listing type, department, description and
merchant-provided collection/delivery information. It preserves selection order
and excludes unpublished, suspended, closed, paused and archived content using
the existing public eligibility rules. It does not rank different currencies or
invent unit prices. Prices can change after the page loads.

The comparison table supports keyboard focus and horizontal scrolling on narrow
screens, with fixed row labels and a scrolling hint. Shared links are readable
without JavaScript or sign-in. Adding selections requires JavaScript and browser
storage. Fixture preview explains that comparison needs the live catalogue.
The privacy notice documents storage, clearing and shared-link behavior.

### Relevant alternatives

A product detail page now displays up to four other available listings of the
same kind in the same department and shop, in the merchant's catalogue order.
This provides a concrete next step when a product is not the customer's choice.
Empty sections are omitted. Archived departments, archived/unavailable alternatives,
other merchants and the selected item cannot populate the section.

The heading is “More from this department.” This is a deterministic catalogue
rule, not a claim about personalisation, purchase popularity or items frequently
bought together. Merchant private previews retain their private navigation and
do not offer public comparison controls.

### Product-aware enquiries and merchant handling

Available products' enquiry links include their canonical identifier. The contact
page validates that the product remains public, belongs to the intended merchant
and is available. It displays the product, advertised price and a return link,
and prompts the customer for quantity or scope, options and timing. Requirements
remain in the message; this is not a structured, priced quotation or stock hold.

The form sends the existing `productId` field instead of discarding it. The backend
continues to revalidate the shop and product at submission, enforce request
budgets and deduplicate retries. The merchant inbox identifies the current linked
listing alongside the customer's message. Queries suppress linked product context
for erased requests. Existing private authorization remains in effect.

The form now explicitly requires JavaScript, disables intake before hydration,
and uses POST as its fallback method. This prevents an unhydrated enquiry form
from submitting customer details in a GET URL. Without scripts, customers are
directed to the merchant's available contact options. Submission receipts still
require merchant confirmation of purchases, payment and stock.

No migration, new package, provider credential or environment variable is required.

## What is required for transaction parity

These changes narrow decision-making and enquiry gaps. They do not deliver
Alibaba, Amazon or Shopify transaction parity, and are not evidence of increased
sales or market leadership. The next substantial programme should be:

1. **Real quotes and orders:** agree whether Londos operates single-merchant or
   multi-merchant purchases; model quote revisions, acceptance, cancellations,
   quantities, currency, tax, fulfilment terms and customer receipts. Separate
   enquiry, quote and order statuses. Test ownership, stale prices and repeated
   acceptance before exposing binding offers.
2. **Inventory and payment integration:** establish units and variants, atomic
   stock reservation and expiry, merchant settlement and a provider-supported
   payment/refund flow. Test signed webhooks, duplicate and out-of-order events,
   failed payments, reconciliation and refund limits. Uganda mobile-money support
   and actual merchant onboarding should be assessed with the chosen provider;
   its commercial and operating constraints cannot be inferred from UI research.
3. **Fulfilment and support:** use actual collection confirmations or carrier
   events, manage returns/disputes, and define customer support responsibilities.
   Display delivery promises only when backed by service-area and fulfilment data.
4. **Growth and assurance:** introduce authentic merchant/product attributes,
   maintained recommendations and transaction-backed reviews. Measure successful
   searches, contact completion, merchant response and, after checkout exists,
   paid orders, fulfilment and repeat purchase.

This sequencing prevents an attractive interface from promising operations the
platform cannot carry out. It also keeps Londos' independent-shop identity rather
than turning its home page into a superficial copy of a global marketplace.

## Verification

- Production build, TypeScript and standalone/worker packaging passed. Final
  ESLint passed with zero allowed warnings.
- Unit suite: **309 passed** across 34 files, including bounded comparison IDs,
  invalid/corrupt browser selections, deduplication and URL construction.
- Catalogue/contact integration suites (`p5.test.ts`, `p6.test.ts`): **57 passed**
  in disposable local PostgreSQL databases. New cases check exact current prices,
  visibility changes, matching departments/kinds, bounded alternatives,
  product-linked enquiry intake and merchant authorization. Existing canonical
  money, search, publishing, request deduplication and catalogue safeguards pass.
- Core browser suites (`discovery-experience.spec.ts`, `p5.spec.ts`,
  `workspace-mall.spec.ts`): **22 passed**. They include comparison, tab sync,
  storage failure/limits, changed prices, restricted selections, malformed links,
  shared links without scripts, product enquiry through to the merchant inbox,
  existing catalogue/contact flows, request-abuse checks and eight public-mall
  navigation scenarios. Installed-app cases simulate browser detection; they are
  not native operating-system package tests.
- Fixture-preview browser suite: **16 passed**, including comparison's truthful
  preview state and its automated accessibility scan. The existing system
  Chromium option was used. **38 distinct browser tests passed in total.**
- Comparison and related/enquiry flows were rerun successfully after the final
  visual adjustments. Comparison was checked at 320, 390, 900 and 1440 pixels,
  with applicable WCAG A/AA and whole-page horizontal-overflow assertions.
  Product/enquiry phone captures and the comparison table were visually inspected.
  The table intentionally scrolls within its labelled region on narrow screens.
- Configured-secret artifact scan passed for **1,920 files / 38 candidate
  values**. This checks exact configured values, not every possible secret.
- All changed source, tests and Markdown pass Prettier. Pre-existing formatting
  debt in unrelated files is not included in this change. Documentation links
  and `git diff --check` pass.

Captures use fictional development data:

- [Product comparison — desktop](images/platform-comparison-1440-2026-10-29.png)
- [Product comparison — phone](images/platform-comparison-390-2026-10-29.png)
- [Related products — phone viewport](images/platform-related-products-390-2026-10-29.png)
- [Product enquiry — phone](images/platform-product-enquiry-390-2026-10-29.png)

Existing tests regenerated older evidence images. Those captures were preserved
outside the repository and their dated originals restored; only this benchmark's
new evidence is committed. Production databases, competitor private accounts and
real purchase/payment flows were not modified or exercised.
