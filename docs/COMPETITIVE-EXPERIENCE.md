# Marketplace experience review

Checked 26 October 2026 (Africa/Kampala). This review covers public, signed-out
pages, not paid accounts, checkout completion, seller dashboards or a performance
benchmark. Original layouts and Londos colours are retained. Competitor imagery,
brand assets, reviews, counts and commercial theme code are not copied.

The [deeper follow-up](DEEP-COMPETITIVE-REVIEW-2026-10-26.md) uses web searches and
official seller/help documentation, including Amazon, Etsy and MTN alternatives
to their previously blocked storefront pages. It records the additional verified
capabilities and the subsequent search-refinement implementation. The direct
page results below remain the historical initial observation, not the limit of
the follow-up research.

| Reference actually inspected | Useful strength | Londos decision |
| --- | --- | --- |
| [CampusPlug listing](https://campusplugug.com/listings/8e58843d-5cdd-48ac-9964-e3e3d158f826) | Clear image/detail split, visible price, direct WhatsApp action, Save/Share and adjacent safety information. | Bring product information and enabled merchant contact actions together; add sharing and browser-local saved shops. Keep merchant payments explicit. |
| [Shopify landing page](https://www.shopify.com/ppc/online-store) | Strong hierarchy, focused primary action, separated benefits and onboarding. This link is a marketing page, not its store editor. | Preserve the six original theme choices and focused editor panels already implemented. Give the mall a clear search-first entrance and merchants a distinct invitation below discovery. |
| [Jumia Uganda](https://www.jumia.ug/) | Broad category discovery; product cards expose current prices, availability and offer context before opening details. | Show the actual matching product/service name, current price and availability in search cards. Use categories that preserve search context. |
| [Jiji Uganda](https://jiji.ug/) | Prominent search, scannable categories and image/price-first listings. | Make category navigation easier on phones; distinguish a product match from its parent shop. |
| [Alibaba](https://www.alibaba.com/) | Clear product/manufacturer search entry, supplier contact and sourcing navigation. Some content is client loaded; no supplier transaction was tested. | Preserve owned-shop identity and clear contact entry; avoid presenting a supplier inquiry as a completed order. |
| [Airbnb](https://www.airbnb.com/) | A restrained header and prominent segmented search were visible. Its listing stream did not load in this research session. | Use the requested image-led, rounded-card direction as an original design brief, with independent Save controls, keyboard focus and legible metadata. Do not claim to have inspected loaded Airbnb listing cards. |

The supplied [MoMo Flash Sale](https://market.momo.africa/Portal/UG/Flash-Sale)
returned HTTP403. [Amazon](https://www.amazon.com/) returned HTTP202 with an empty
response. An additional [Etsy](https://www.etsy.com/) reference returned HTTP403.
Their live cards, flash-sale rules, checkout and account workflows were not
verified. There is no rating out of ten: visual quality requires user testing,
and full commerce platforms have capabilities beyond Londos's current remit.

## Implementation scope

- A search-led mall entrance, browsable category rail, clear active filters,
  meaningful empty states, and responsive image-led shop cards.
- A product search match includes its actual price and current availability,
  points at the exact product, and prefers that product's eligible image.
- Save/remove up to 40 shops on this browser; a separate saved page re-resolves
  current public records instead of retaining stale names, images or URLs.
- Public shop/product sharing uses the native share sheet where supported,
  clipboard next, and an explicit selectable link if those are unavailable.
- Product contact options stay beside the item and a mobile contact shortcut
  makes the same enabled methods easier to reach.

Existing theme customisation, explicit draft/publication, tenant boundaries,
media eligibility, manual shop rent and commerce semantics remain in force.
No new package, credential, environment variable or SQL migration is required.

## Capabilities requiring separate product work

A cross-merchant cart, payment capture/refunds, shipping quotes/tracking,
inventory reservations, dispute handling, genuine customer reviews, price-history
discounts and timed offers need their own records, policies and integrations.
They are not represented with simulated buttons, ratings, stock counts or
countdowns. A merchant's verification or rent payment does not prove product
quality. Saved shops are device-local, not an account-synchronised wishlist.

## Saved shops and privacy

Only a versioned bounded array of shop UUIDs is saved under
`londos.saved-shops.v1` in localStorage. No account tokens, product details,
email addresses, merchant content or visit history are stored. The page posts
those IDs to a same-origin, body-bounded, rate-limited public read endpoint;
the canonical publication, tenancy, moderation and operations gates apply.
Unavailable shops are not named or shown. Removing a saved ID or clearing the
list updates this browser; clearing site data also removes it. Browser storage
may be unavailable, and the UI must explain a failed save rather than claim it
succeeded. There is no browser fingerprint or third-party analytics dependency.
