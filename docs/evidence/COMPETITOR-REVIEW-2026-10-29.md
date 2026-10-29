# Independent marketplace review — 29 October 2026

Baseline: `b056ccb` on `feature/hosted-lifecycle-secure-2026-10-23` in
`Courtlyambuiguity34/londos`. This is a review of the public websites in the
user's Explee screenshot, followed by an implementation against the existing
Londos catalogue. No competitor assets, wording or layouts were copied.

## Scope and evidence

All 15 addresses were investigated. Fourteen home pages returned successful
HTML responses in this environment. Je soutiens mes commerces timed out;
its first-party indexed pages provide limited evidence only. Aprop, BRNDS,
The Big Small UK and Shop Local Greater Kalamazoo also received desktop and
390-pixel browser inspection. Some assets and scroll-triggered sections did not
render reliably in these research captures, so they are not performance or
accessibility scores. Other sites were assessed from their public page content,
navigation and linked first-party policies. No account creation, payment,
merchant dashboard access or completed checkout was attempted on competitor sites.

The truncated screenshot labels were expanded to the matching public domains
below. `shoplocalgreater…` is provisionally **Shop Local Greater Kalamazoo**;
the screenshot alone does not establish the full address. Toulouse Boutiques,
The Big Small UK, Je soutiens mes commerces and Old Mill Market Square are also
domain expansions from truncated labels. Conclusions are tied to the linked
sites, rather than an assumption that Explee proved these businesses compete
directly with Londos.

## Site-by-site findings

| Website                                                                                               | Model and useful pattern observed                                                                                                                                                                  | Critical assessment and Londos decision                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Aprop](https://aprop.es/)                                                                            | Local marketplace with distinct browsing and seller entry points, a short buying explanation, named sellers and prices.                                                                            | Londos already separates discovery from opening a shop. Its explanatory pattern supports a clearer buyer guide. Aprop's fetched navigation includes generic shop-template sections; do not reproduce that complexity or its unverified transaction promises.                                                                        |
| [TiendiT](https://tiendit.com/)                                                                       | Neighbourhood-commerce marketplace with buyer/seller guidance, seller manuals and shop setup explanations.                                                                                         | The live home page also announces forthcoming opening and preregistration. It is not evidence of mature order operations. Keep Londos onboarding distinct from buyer help; avoid its very large category menu. [Buyer guidance](https://tiendit.com/registrate-para-comprar-en-tiendas-de-barrio/) is a useful information pattern. |
| [BRNDS](https://brnds.fr/)                                                                            | Independent fashion boutiques; product discovery and buyer FAQs appear on the home page. Seller, brand, delivery and return responsibilities are explained.                                        | Helpful answers close to discovery reduce uncertainty. Londos now has linked, truthful shopping FAQs and clearer merchant buying details. BRNDS' authenticity, discount, shipping and return promises cannot be transferred to Londos without the corresponding operations.                                                         |
| [Je soutiens mes commerces](https://jesoutiensmescommerces.fr/)                                       | Indexed first-party content describes individual local shops, place-based discovery, collection and delivery organised by each merchant.                                                           | Direct home and about-page requests timed out. The indexed copy references its 2020 origins and includes unrelated news content. No claim about a currently functioning map or checkout is made. Merchant-specific fulfilment information fits Londos; a location finder needs approved public location data first.                 |
| [Toulouse Boutiques](https://toulouseboutiques.com/)                                                  | Local shopping and shop discovery with detailed categories and gift discovery by occasion or recipient. [Marketplace explanation](https://toulouseboutiques.com/marketplace-toulouse/).            | Useful browsing cues, but its deep taxonomy would overwhelm a small Londos catalogue. Add a general budget refinement now; defer editorial gift collections until there is sufficient real stock and a maintained selection process.                                                                                                |
| [Indieshops](https://indieshops.co/)                                                                  | Image-led independent-shop directory with interest tags and descriptive shop introductions.                                                                                                        | Shop identity and photography are strengths, but the long repeating directory is not evidence of an integrated buying flow. Londos already has image-led shop discovery, themes, saved shops and direct product links; retain these rather than replacing its interface.                                                            |
| [Shop Local Scotland](https://shoplocal.scot/)                                                        | Partner directory, vouchers and events; individual shops have their own information and [merchant policy pages](https://shoplocal.scot/business/fenwick-candles/policies/).                        | Surfacing fulfilment responsibilities is relevant and implemented using existing merchant fields. Vouchers and event ticketing involve redemption, accounting and partner integrations; adding those buttons alone would not provide the feature.                                                                                   |
| [The Big Small UK](https://www.thebigsmalluk.com/)                                                    | Independent-maker directory with product-type and region filters. Its [Gift Finder](https://www.thebigsmalluk.com/gift-finder) explicitly asks for budget, recipient, interests and required date. | This is a paid, manually fulfilled gift-selection request, not an automated price filter. The useful principle is starting with shopping constraints. Londos gains a self-service budget filter without pretending to provide personal gift curation.                                                                               |
| [Maker2u](https://www.maker2u.com/)                                                                   | Maker marketplace showing products, prices and seller names, alongside maker and gift browsing.                                                                                                    | Product-to-merchant continuity is useful and already central to Londos. Budget results now always link to an actual qualifying listing and show its price. Do not import repeated promotional sections or unsupported popularity labels.                                                                                            |
| [Old Mill Market Square](https://www.oldmillmarketsquare.com/)                                        | Primarily a physical vendor market: practical address, hours, contact details, vendor access and an explicit no-shipping/no-returns statement.                                                     | This is not a like-for-like online marketplace. The transferable lesson is clear practical buying information. Do not publish private merchant application addresses as collection locations or invent shop opening hours.                                                                                                          |
| [Shop Local Greater Kalamazoo](https://www.shoplocalgreaterkalamazoo.com/) — provisional domain match | Community browsing, seller attribution, gift collections and a gift guide with a price ceiling; buyer and seller paths are distinct.                                                               | Budget-led discovery is a clear gap in Londos and is implemented. Its advertised common cart and gift card require real order, payment, redemption and refund infrastructure, which this catalogue/contact product does not have. Research did not exercise those transactions.                                                     |
| [Look Local](https://looklocal.ca/)                                                                   | The current site presents community articles, events and local shopping stories.                                                                                                                   | Historical material discusses an online marketplace, but today's home page should not be described as that historical checkout experience. Merchant storytelling could help Londos once authentic content and editorial ownership exist; avoid fabricated articles or automatic endorsements.                                       |
| [Majha Udyog](https://majhaudyog.in/)                                                                 | Local-business seller registration, store discovery and a short setup sequence explaining plan, registration, logo and going online.                                                               | Merchant next steps are useful. Its home page also contains generic gadget categories and an empty product section. Londos already has concrete shopkeeper onboarding and catalogue recovery; do not add empty category or promotional blocks merely to look larger.                                                                |
| [Anuemart](https://anuemart.com/)                                                                     | Local-vendor discovery with seller attribution, visible prices and vendor registration.                                                                                                            | Help is easy to locate, but its [FAQ](https://anuemart.com/faq/) currently contains unrelated generator questions and placeholder answers. The right improvement is real answers, not just an FAQ component. Londos now answers actual browsing, budget, contact, payment, fulfilment, return and saved-shop questions.             |
| [Cop&Drop](https://www.copdrop.in/)                                                                   | Homegrown fashion-brand positioning, product categories, wishlist and linked [shipping information](https://www.copdrop.in/shipping-policy).                                                       | Clear merchant identity and purchase policies are useful. Londos already supports brand expression, sharing and saved shops; new buying information explains merchant responsibility. Do not add unsupported return guarantees, shipment tracking, reviews or discount claims.                                                      |

## Changes implemented

1. **Search by budget.** Native GET forms accept a minimum, maximum or both in
   UGX, USD, KES, EUR or GBP. Bounds are inclusive. Conversion uses exact integer
   minor units, with whole UGX amounts and at most two decimal places elsewhere.
   Negative, malformed, overlarge, duplicated and reversed inputs are rejected.
   Currency selection alone leaves the existing unfiltered search unchanged.
   Listings without a known price do not qualify for an active budget.
2. **Relevant results throughout the flow.** The canonical database applies the
   price, type and availability conditions to the same listing before paging.
   Shop-name and department-name matches show a qualifying product and its
   price. Category, scoped-shop searches, text searches and next-page links keep
   the budget; an applied-filter chip removes it. Cursors bind to the exact,
   normalised budget. Empty results offer a recovery path. Fixture preview
   explicitly explains that budget filtering requires the live catalogue.
3. **Readable buying facts.** Shop/product contact sections and enquiry pages
   show collection/delivery choices and separately labelled merchant delivery
   and payment instructions. Missing fulfilment choices prompt the shopper to
   ask. The interface identifies these as merchant-provided information and
   asks shoppers to confirm costs, timing and return terms. Existing contact
   actions and public eligibility checks remain the source of truth.
4. **Shopping help.** `/help` provides three practical steps and eight native
   disclosure FAQs. It is linked from desktop navigation, the mobile menu,
   footer and shop purchase-information cards. Buyer help and merchant signup
   remain separate. The guide accurately explains direct merchant payment,
   enquiry limitations, device-local saved shops and reporting.

No new migration, package, environment variable or external service is required.
The existing public navigation fix, shop themes, publishing controls and private
workspaces are preserved.

## Competitive judgment and deferred work

These changes make product discovery more purposeful and the buying handoff
clearer. They do **not** establish market leadership: this review measures no
conversion, retention, stock depth, fulfilment reliability or competitor revenue.
Londos' existing shop-centred model and customisable storefronts are strengths
worth retaining. Validate the changes with real shoppers and merchants, using
successful searches and completed merchant connections rather than appearance
alone.

The strongest future opportunities are public service-area discovery, authentic
merchant stories and curated gift collections. Each needs reliable merchant data
or content ownership. A unified cart, platform checkout, vouchers, delivery
tracking, buyer protection and verified reviews are separate product projects
requiring operating rules and backend systems. They are not represented here by
non-functional UI.

## Verification

- Production build and standalone/worker packaging: passed. Build TypeScript
  checks and `npm run typecheck` passed.
- ESLint with zero allowed warnings: passed.
- Unit suite: **308 passed** across 33 files, including exact money conversion,
  invalid budget ranges and context-preserving URLs.
- `npm run test:integration -- tests/integration/p6.test.ts`: **31 passed** in a
  disposable local PostgreSQL database. Includes matching product/department/shop
  searches, currency isolation, inclusive/zero/large prices, unknown-price
  exclusion, same-listing filters, publication/moderation/tenancy restrictions,
  paging without gaps or duplicates, normalised cursor scope and default-search
  compatibility. No production database was modified.
- Database browser suite (`discovery-experience.spec.ts` and
  `workspace-mall.spec.ts`): **17 passed**. Includes budget forms and help without
  JavaScript, keyboard interaction, all four merchant fulfilment choices,
  enquiry-page details, empty/error recovery and existing saved-shop behavior.
  The eight workspace scenarios cover shopkeeper/landlord return journeys in
  desktop/phone browser and simulated installed-app detection; they are not
  native OS app-package tests.
- Fixture-preview browser suite: **16 passed**, including the new help page in
  automated accessibility checks. Chromium was selected through the existing
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` option.
- New discovery/help views were checked at 320, 390, 900 and 1440 pixels;
  product buying details at 320, 390 and 1280 pixels. Applicable automated WCAG
  A/AA scans and horizontal-overflow assertions passed. Visual captures were
  inspected; automated scans are not a substitute for a complete accessibility
  audit.
- Configured-secret artifact scan: passed for **1,908 files / 38 candidate
  values**. This scans exact configured values and does not claim a general
  secret audit.
- Formatting: all changed source, test and Markdown files pass Prettier.
  Repository-wide `npm run format:check` still reports **27 pre-existing
  warnings in unchanged files**, verified against the baseline. Unrelated files
  were not reformatted. Documentation links and `git diff --check` pass.

Londos captures use fictional development merchants:

- [Budget discovery — desktop](images/competitor-budget-1440-2026-10-29.png)
- [Budget discovery — phone](images/competitor-budget-390-2026-10-29.png)
- [Merchant buying details](images/competitor-buying-details-1280-2026-10-29.png)
- [Shopping help — phone](images/competitor-shopping-help-390-2026-10-29.png)

Historical screenshots regenerated by existing tests were preserved outside the
repository and their dated originals restored. Only this change's new captures
are included. Competitor payments and private merchant journeys were outside
this public research scope.
