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

## P11 measured topology and reproducible workload

`npm run benchmark:p11` preserves the historical X2 report and records a new production-build run. It uses roughly 1,500 shops/150,000 products, distinct normalized photographic assets filling the 32-card hot shop, status mixes, first/warm route samples, a 20-client burst and four 20-second closed-loop phases at 1/5/20/40 clients. Eighty percent of mixed public traffic targets the hot shop, alongside native merchant transactions and visibility checks on both independent compiled web processes. Report p50/p95/p99, sample counts, errors, observed throughput, PostgreSQL states/waits, queue age and sampled process RSS/CPU. The 40-client diagnostic observes saturation; it does not change the established 20-client 1,500 ms budget.

The previous budgets remain: search p95 250 ms, SSR p95 500 ms, 20-client burst/mixed p95 1,500 ms, compressed HTML 80 KiB, initial JS 200 KiB, initial images 350 KiB, upload 1,000 ms and first-image worker readiness 5,000 ms. Canonical service SELECT counts and actual EXPLAIN ANALYZE/BUFFERS are recorded. First route requests are not a cold PostgreSQL disk-cache experiment. Browser transfer counts include requested initial/lazy-loaded resources and do not establish a mobile usability SLA. Additional photographic worker samples remain visible.

Public responses use no-store canonical reads; request-local metadata/content reuse is cursor-aware. Per-shop generation counters conservatively reject stale catalogue continuation and AI context without a global invalidation service. Two web pools and an independent worker share the real development PostgreSQL; independent process restart and urgent eligibility denial are verified. Production ingress/CDN/pool sizing/roles and peak whole-host capacity remain external/P12 validation.

Mobile checks emulate 390×844, fourfold CPU slowdown, 150 ms latency and 1.6 Mbps download/750 Kbps upload in system Chromium. All three rendered themes and semantic spaces are checked with axe, keyboard/focus, reduced motion and accessible-tree tasks. Actual handset, Ugandan connection and screen-reader user sessions remain separate evidence requirements.

### Final P11 observations

[Final benchmark](evidence/X2-P11-BENCHMARK.json) and [mixed/resource samples](evidence/X2-P11-LOAD.json) pass at the declared scope. Search p95 is 129.81 ms; warm maximum-route SSR p95 410.26 ms; 20-client burst p95 891.74 ms. The 20-client mixed workload p95 is 705.48 ms with zero request/write/visibility errors, approximately 56.69 requests/s. Forty clients reach p95 1,638.76 ms/p99 2,140.21 ms and plateau at 54.15 requests/s: an observed saturation warning, not an increased supported budget. [Measured plot](evidence/images/x2-p11-load.png).

The fully populated photographic shop transfers 143,377 bytes JS, 6,510 CSS and 186,900 images; the added predeclared CSS budget is 40 KiB. First worker readiness is 626.74 ms. All original budgets pass. Four-core quota/32 GiB environment hardware and sampled process/SQL observations are recorded; no whole-host peak/production SLA claim. See the [complete acceptance record](evidence/X2-P11.md) for native writes, recovery, mobile timings and external limits.
