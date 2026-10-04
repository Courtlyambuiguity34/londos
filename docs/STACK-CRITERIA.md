# Technology Stack Selection Criteria

**Current direction:** the owner selected Next.js / TypeScript / Node.js / PostgreSQL in the master instruction; see [ADR-0002](ADR/0002-nextjs-node-application-architecture.md). The criteria below guide remaining tooling/vendor choices and any explicitly justified future reconsideration. They do not require restarting framework selection during the current build.

## Rule

Choose technology after the product and operational requirements, not before them.

## Requirements the stack must satisfy

### Public performance
- fast server response;
- cache-friendly public shops;
- mobile-first rendering;
- efficient pagination/search;
- CDN/object-storage integration;
- image optimization.

### Backend correctness
- mature authentication/authorization ecosystem;
- relational transactions;
- background jobs;
- idempotency support;
- clear modular boundaries;
- migrations;
- observability;
- rate limiting/security tooling.

### Data
A relational database is strongly favored for canonical commerce/tenancy data because Londos has strong relationships and transactional state:
- shops;
- memberships;
- departments/products;
- rent ledger;
- tenancy states;
- verification;
- audit.

The exact database vendor remains open.

### Search
Initial search may use relational full-text/index features if benchmarks satisfy pilot needs. A dedicated search engine should be introduced when relevance/features/load justify the operational cost.

### Media
Use object storage semantics rather than storing large image/video blobs in relational rows. Support background transformations and CDN delivery.

### Cache/queue
Can begin with simple managed/shared infrastructure; do not add multiple distributed systems unless needed.

## Evaluation dimensions

Score candidate stacks on:
- developer familiarity;
- correctness/security;
- performance;
- hosting cost;
- deployment simplicity;
- ecosystem maturity;
- observability;
- background jobs;
- testing;
- localization;
- hiring/maintainability;
- migration path to scale;
- vendor lock-in;
- low-bandwidth UX.

## Candidate architecture styles to compare

1. **Server-rendered modular monolith**
   - potentially simplest/cheapest;
   - excellent for cacheable content;
   - less frontend complexity.

2. **Hybrid SSR frontend + API backend**
   - richer UI separation;
   - more deployment/runtime complexity.

3. **SPA + API**
   - should not be default merely because it is common;
   - carefully assess initial bundle/network cost for target users.

The first pilot does not require microservices.

## Stack decision gate

Do not finalize until we know:
- who will maintain it;
- expected first-year budget;
- rent collection integration;
- localization requirements;
- pilot catalogue/media sizes;
- deployment/provider constraints;
- whether conversational design AI is cloud or optional;
- privacy/legal constraints.

Then benchmark 2–3 realistic candidates and record an ADR.
