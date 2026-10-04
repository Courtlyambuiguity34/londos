# Vertical Prototype Plan

## Purpose

Prove the proposed Django/PostgreSQL architecture against Londos's hardest requirements before building the complete product.

## Dataset

Generate synthetic data approximating:
- 1 logical mall;
- 1,500 shops;
- 5–10 departments/shop where appropriate;
- representative catalogue distribution;
- target stress case around 100 products/shop (approximately 150,000 products);
- media metadata without needing 150,000 physical image files.

Include active, grace, closed and suspended shops so search eligibility can be tested.

## Slice 1 — LSS rendering

Create Annette Fashion House with:
- Dresses;
- Shoes;
- Handbags;
- New Arrivals;
- WhatsApp action.

Load a valid LSS v0.1 document and render a mobile-first public shop.

Acceptance:
- no arbitrary code execution;
- missing product/media fallback works;
- closed-shop state overrides design;
- renderer uses canonical current price/product state.

## Slice 2 — discovery

Query “shoes”.

Acceptance:
- only eligible shops;
- bounded 20-result first page;
- one tenant cannot dominate;
- selecting Annette lands in shoes context;
- internal mall ID is irrelevant to ranking;
- query plan/index usage recorded.

## Slice 3 — merchant update

Change Annette's product price/availability.

Acceptance:
- canonical write is transactional;
- search/public projection becomes fresh within defined prototype target;
- unrelated shop cache/state is untouched.

## Slice 4 — tenancy security

Create Merchant A and Merchant B.

Attempt to mutate B's product using A's authenticated session and guessed IDs.

Acceptance: every attempt is denied server-side and tested automatically.

## Slice 5 — media

Upload a deliberately oversized product photo.

Acceptance:
- request does not block on all transformations;
- validation occurs;
- worker generates optimized variants;
- public page selects an appropriate variant;
- failure state/retry is observable.

## Slice 6 — LSS conversational patch stub

No AI required initially.

Submit the structured equivalent of:
“Move shoes before handbags.”

Acceptance:
- base revision required;
- patch validated;
- preview revision created;
- conflict detected if base revision is stale;
- publish changes only after confirmation.

## Measurements

Record:
- server response latency;
- DB query count/time;
- search latency and query plan;
- HTML transfer size;
- JavaScript transfer size;
- above-the-fold image bytes;
- memory at idle/load;
- worker processing time;
- authorization test results.

## Philosophy

This is not the MVP. It is an **architecture experiment**. Ugly internal UI is acceptable. Architectural uncertainty is what we are trying to remove.
