# Deeper marketplace research and Londos priorities

Checked 26 October 2026 (Africa/Kampala), following the owner's request to use
search and other public documentation when a storefront cannot be inspected.
This extends the [initial live-page review](COMPETITIVE-EXPERIENCE.md).

## Research method and evidence

The review tried 14 focused queries across Bing, Google and DuckDuckGo, then
read the relevant official documentation directly and followed links from
official sites. Bing returned largely irrelevant matches for these queries;
Google returned a search-access/help screen. Some DuckDuckGo queries returned
useful official Etsy and MTN results; others encountered a bot challenge. No
challenge was bypassed. Search results were discovery aids, not proof of a
feature: the substantive findings below come from the linked source pages.

The formerly blocked Amazon, Etsy and MoMo storefronts did not end the research.
Amazon's seller and advertising sites, Etsy's Help Centre and an official MTN
Uganda article supplied usable alternatives. Official help documents describe
supported workflows; reading them does not mean we completed checkout, used a
private seller dashboard or independently verified a company's conversion claims.

## What the stronger platforms actually do

| Platform and checked primary sources | Strength supported by the sources | Implication for Londos |
| --- | --- | --- |
| Amazon: [product listings](https://sell.amazon.com/blog/amazon-product-listings), [Brand Stores](https://advertising.amazon.com/solutions/products/stores), [storefront builder](https://sell.amazon.com/blog/amazon-storefront), [A+ Content](https://sell.amazon.com/tools/a-content) | Structured product facts and offers; organised imagery; variations; feature-focused descriptions; reusable store tiles and templates; richer educational content and store measurement. | Product information quality matters as much as the card design. Preserve merchant storefront identity and add structured attributes/variants and richer product media as backed features. Do not reproduce Amazon's seller eligibility rules or claim its conversion results for Londos. |
| Shopify: [filters](https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-filters), [predictive search](https://help.shopify.com/en/manual/online-store/storefront-search/predictive-search), [sections and blocks](https://help.shopify.com/en/manual/online-store/themes/theme-structure/sections-and-blocks), [theme architecture](https://shopify.dev/docs/storefronts/themes/architecture) | Storefront refinements; a separate full search result page beyond suggestions; reusable sections/blocks; merchant-configurable settings separated from rendering code. | Build filters on the current canonical records, with context kept in URLs. Keep the existing six themes, reviewed JSON presets and explicit draft/publication. Next, add a bounded accessible suggestion service rather than an unbounded client download of the catalogue. |
| Etsy: [shop sections](https://help.etsy.com/hc/en-us/articles/360000345048-How-to-Create-and-Manage-Shop-Sections), [listing variations](https://help.etsy.com/hc/en-us/articles/115015664047-How-to-Add-Variations-to-Your-Listings), [favourites and collections](https://help.etsy.com/hc/en-us/articles/115015439627-How-to-Keep-Track-of-Items-and-Shops-You-Love) | Named shop sections; options with their own price/quantity/SKU behaviour; saving both items and shops; named collections with privacy settings. | Departments and saved shops provide part of this experience. Variant records, item favourites, named collections and account synchronisation are additional work; a heart alone does not supply them. |
| Airbnb: [wishlists](https://www.airbnb.com/help/article/1236), [sharing listings](https://www.airbnb.com/help/article/2386) | Heart-based saving, named wishlists, collaboration and share modes; shareable listing/profile destinations. | Keep the current card's independent Save action and public sharing. Privacy and permissions must be designed before implementing collaborative lists. A listing URL must remain tied to current visibility, not copied private data. The initial live card stream still was not inspected. |
| MoMo Market: [official MTN Uganda campaign article](https://www.mtn.co.ug/newsabout/mtn-market-by-momo-launches-sambagala-full-time-bringing-the-excitement-home-with-trusted-deals-delivered-straight-to-your-doorstep/) | MTN describes product discovery, campaigns, MoMo payments and doorstep delivery in selected locations, accessible through the site and MoMo app. | This is a commerce operations workflow as well as a promotional layout. Taking product payments needs provider integration, payment references, order state and fulfilment handling. Campaign prices and delivery claims in this article are not Londos offers or promises. |
| Jumia Uganda: [public mall](https://www.jumia.ug/), [help entry](https://www.jumia.ug/sp-help), [returns entry](https://www.jumia.ug/sp-returns-and-refunds-policy/) | The public mall exposes prices and promotional context. Its navigation separates ordering, payment, tracking, pickup, reporting and returns. | Put each workflow where the shopper expects it. The help/returns responses exposed navigation but did not fully render their policy body in this session; no specific return period or refund entitlement is inferred. |
| Jiji Uganda: [buyer safety](https://jiji.ug/safety-tips.html), [public mall](https://jiji.ug/) | Price-led discovery and an explicit contact-marketplace safety model. Its safety page distinguishes inspecting goods, service scope, payment and account-information precautions. | Preserve Londos's direct merchant-contact model and reporting. A verified identity, paid shop rent, or a listed price must not be presented as a platform product guarantee. |
| CampusPlug: [home](https://campusplugug.com/), [supplied listing](https://campusplugug.com/listings/8e58843d-5cdd-48ac-9964-e3e3d158f826) | A focused niche, category-led listings, contextual WhatsApp contact, a simple seller journey and nearby purchase-safety information. | Keep contact close to the item, clarify who sells it, and make the merchant journey understandable. Avoid showing an unearned trust badge. The previous update already added product context to WhatsApp links. |
| Alibaba: [public homepage](https://www.alibaba.com/) | Product/manufacturer search and sourcing/inquiry entry points were visible in the initial review. | A future quotation workflow could fit service and bulk sellers. The Trade Assurance site timed out in follow-up requests, so its specific eligibility/refund terms are not treated as verified here. |

Independent UX research helps decide which patterns are useful rather than
copying a large site's appearance. Baymard's
[product lists/filtering overview](https://baymard.com/research/ecommerce-product-lists)
and [applied-filter research](https://baymard.com/research-articles/how-to-design-applied-filters)
describe the value of visible selection confirmation, removable refinements and
context on desktop and mobile. That directly informs the refinement controls and
applied-filter overview implemented in this follow-up. No paid research account
or unpublished guideline library was accessed.

## How these ideas translate into the existing architecture

Shopify publicly documents layouts, templates, sections, blocks, snippets,
assets and merchant JSON settings. The important design principle for Londos is
the separation of reusable rendering code from reviewed merchant configuration.
Londos already follows that direction through theme JSON files, supported layout
tokens, versioned shop specifications and explicit preview/publish steps. It
does not need a framework rewrite or arbitrary uploaded theme code.

Amazon's public documentation explains seller-facing listing/store workflows;
it does not reveal the complete private backend. Likewise, MTN's article is not
an API contract or a description of its private database. Internal frameworks,
service layouts and operational guarantees are not inferred from screenshots.

For Londos, Postgres remains canonical. Current visibility is checked before
results are returned; filters run before keyset pagination; currency amounts
remain exact; images must pass the existing owned/ready/public eligibility
checks. Browser state chooses a query or saves IDs; it does not decide authority,
price, shop publication, merchant identity or stock. MongoDB remains an optional
public copy and is not introduced as a second write path by these UX changes.

## Implemented after this deeper review

**Refine results** lets a visitor find shops offering products, services, or
both, and choose all current listings or available listings. A shop qualifies
only when its current non-archived catalogue contains a matching listing in an
active department. Product and department search hits must satisfy the same
refinements. A shop-name hit may still lead to the whole qualifying shop.

The result unit remains one shop per card, not an exhaustive product list.
When browsing with refinements and no search text, the card exposes a qualifying
item and links directly to it. Availability is merchant-provided, not a stock
reservation or a delivery guarantee. Ordinary unfiltered searches keep their
existing behaviour and cursor scope.

The controls use native GET forms and disclosure elements. They work without
browser JavaScript. Query, category, shop scope and refinements survive searches,
category changes and pagination. Applied-filter links remove one refinement;
**Clear refinements** keeps the query/category/shop context. Changing a filter
starts at page one. An empty state offers to search without the refinements.

See [verification and file inventory](evidence/SEARCH-REFINEMENTS-2026-10-26.md).
No new credentials, environment variables, packages or migrations are needed.

## Remaining priorities, with their real dependencies

| Priority | Improvement | What must back it |
| --- | --- | --- |
| Next catalogue work | Variant choices, structured specifications and multiple product images | Owned variant/attribute/media records, exact prices, clear editor validation, accessible selection, publication/visibility tests and an additive migration. |
| Next discovery work | Currency-aware price ranges, meaningful sorting and bounded suggestions | Explicit currency semantics, index/query planning, stable filter-aware cursors, deadlines and keyboard-accessible suggestions. USD and UGX cannot simply be sorted as comparable integers. |
| Next saved-list work | Save individual items, named lists and optional account sync | A private account-owned model, removal/erasure behaviour and explicit sharing permissions. Current browser-local saved shops should remain available. |
| Commerce expansion | Cart/checkout, MoMo capture, delivery and returns | Order/stock state, provider/webhook verification and idempotency, reconciliation, fulfilment responsibilities, merchant policies and refund/dispute handling. Manual shop rent is a separate existing workflow. |
| Promotions and trust | Genuine product offers, authentic reviews and useful performance reporting | Offer periods and price history, eligibility, real review provenance and abuse handling, consent-aware measurements and clear definitions. No invented ratings, countdowns or conversion claims. |

This is a concrete capability map, not a claim that Londos already replaces
every platform above. The checked sources support these priorities; merchant
and shopper testing on Londos is still needed to measure whether the changes
improve discovery and successful contact.
