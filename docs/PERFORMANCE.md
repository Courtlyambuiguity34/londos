# Search, Performance & Media

## Core rule

**The customer downloads only what they need now.**

If 1,500 shops each eventually average 100 products, a logical mall could reference 150,000 products. That does not mean the entrance should fetch 150,000 products.

## Query model

The entrance loads only essentials such as:
- navigation/categories;
- a small set of featured/relevant shops;
- search UI;
- lightweight mall metadata.

A query should:
1. normalize intent;
2. apply eligibility/safety filters;
3. search indexed public shop/product projections;
4. rank relevant shops/results;
5. return a bounded first page;
6. provide a cursor/page for more.

An initial batch around **20 results** is a testable starting point, not a permanent constant.

## Search scopes

### Global
Searches all eligible public shops regardless of internal mall assignment.

### Category/department
Searches a constrained commercial area such as Fashion or Restaurants.

### Shop-local
Searches only the current tenant's catalogue.

## Caching

Cache read-heavy public data and popular queries where useful. Cache keys must include all dimensions that affect correctness/visibility.

On merchant publication/update, invalidate only affected resources. Do not clear the entire mall.

## Media pipeline

```text
Merchant upload
→ validate file/type/limits
→ malware/safety checks where applicable
→ strip unnecessary metadata
→ optimize/transcode
→ create responsive variants
→ store
→ publish via CDN
```

For an oversized ordinary product photo, customers should receive an appropriately compressed variant—not the original multi-megabyte upload.

Potential variants:
- tiny thumbnail;
- search/result card;
- product display;
- compressed high-quality/master.

Exact dimensions/byte targets must be determined by visual-quality and network testing.

## Lazy loading

Do not load below-the-fold product media until needed. Use responsive formats and dimensions so a low-end phone does not download desktop-sized images.

## Video / 360 / 3D

Support can be added as justified, especially for showroom categories, but these formats have materially different storage, processing and bandwidth economics. Quotas/rent/resource policy should account for that.

## Background work

Keep expensive non-critical work away from storefront request latency:
- image/video transformations;
- search indexing;
- analytics aggregation;
- notifications;
- scheduled rent reminders;
- report generation.

## Performance measurements to establish

Before scale claims, measure:
- p50/p95/p99 response latency;
- first content render on representative Ugandan mobile networks/devices;
- page transfer size;
- image bytes per session;
- search latency;
- cache hit rate;
- DB query count/time;
- error rate;
- media processing backlog;
- cost per active shop/customer session.
