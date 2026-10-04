# Londos Stack Comparison — Decision Round 1

**Date:** 2026-10-04

## Decision context

The first Londos implementation must optimize for:
- low-bandwidth/mobile public browsing;
- very low operating cost during pilot;
- strong relational tenancy/rent correctness;
- safe LSS rendering;
- merchant and landlord authentication/authorization;
- background media/index/rent jobs;
- simple deployment/maintenance by a small team;
- a credible path from 10–20 pilot merchants to thousands of shops.

The first version does **not** need microservices.

## Candidate A — Django 6 modular monolith + PostgreSQL + server-rendered/hybrid UI

### Shape

```text
CDN / reverse proxy
        |
   Django ASGI
   /    |     \
Public Shopkeeper Landlord
   |       |
   +--- domain modules ---+
             |
         PostgreSQL
         /    |    \
      cache  jobs  object storage
```

LSS is rendered through platform-controlled server-side components/templates, with small client-side islands only where interaction needs them.

### Strengths
- one application/deployment boundary initially;
- mature ORM, migrations, auth/session/admin/security ecosystem;
- excellent fit for relational tenancy/rent/moderation data;
- server-rendered HTML can minimize customer JavaScript;
- Django admin can accelerate internal pilot operations without becoming the final Landlord UX;
- Django 6 has a Tasks contract, while production execution can use an external worker/backend;
- straightforward Python integration for future AI/design tooling;
- lower cognitive/operational overhead for a small team.

### Weaknesses
- highly interactive visual design tooling may eventually benefit from a richer frontend;
- must deliberately design LSS renderer/components rather than relying on generic templates;
- async/background execution still needs external infrastructure;
- public UI quality depends on disciplined frontend engineering, not the framework name.

## Candidate B — Next.js public/private frontend + FastAPI domain API + PostgreSQL

### Shape

```text
CDN
 |
Next.js
 |
FastAPI
 |
PostgreSQL + workers + object storage
```

### Strengths
- excellent React component model for LSS renderer/designer;
- strong server/client component split;
- caching and static/dynamic rendering options;
- FastAPI is familiar and excellent for typed APIs/AI integration;
- clean frontend/backend separation;
- strong long-term interactive design-tool potential.

### Weaknesses
- two application runtimes and dependency ecosystems from day one;
- authentication/session/cache invalidation must cross boundaries;
- more deployment/observability complexity;
- background work still needs worker/queue architecture;
- easier to accidentally ship unnecessary JavaScript to low-end phones;
- higher engineering burden before product-market evidence.

## Candidate C — Next.js full-stack + PostgreSQL

### Strengths
- one JavaScript/TypeScript application;
- excellent LSS component/rendering model;
- server components allow server-first public pages;
- sophisticated caching/rendering options.

### Weaknesses
- Londos has deep transactional/operational backend behavior where a dedicated mature domain backend is attractive;
- background media/rent/moderation workflows still need careful worker infrastructure;
- user/team's strongest existing backend experience is Python;
- AI/data tooling likely introduces Python anyway;
- risks making frontend framework concerns shape the core domain.

## Weighted architecture score

Scores are architectural estimates (1–10), not benchmarks.

| Criterion | Weight | Django modular monolith | Next + FastAPI | Next full-stack |
|---|---:|---:|---:|---:|
| Low-bandwidth public UX | 18% | 9 | 9 | 9 |
| Initial simplicity | 15% | 10 | 6 | 8 |
| Domain/transaction fit | 15% | 10 | 8 | 7 |
| LSS/design fit | 12% | 8 | 10 | 10 |
| Early operating cost | 12% | 10 | 7 | 8 |
| Security/admin maturity | 10% | 9 | 8 | 7 |
| Background jobs | 7% | 8 | 8 | 7 |
| Scaling path | 7% | 8 | 9 | 8 |
| Current team familiarity | 4% | 8 | 9 | 6 |
| **Weighted score / 100** | | **91.2** | **81.1** | **80.2** |

These scores should be challenged with prototypes/benchmarks before a final irreversible commitment.

## Round-1 recommendation

**Django 6 modular monolith wins the first implementation round.**

This is not a declaration that React/Next.js is unsuitable for Londos. It means the pilot benefits more from reducing moving parts than from maximizing frontend flexibility immediately.

### Important escape hatch

LSS is intentionally framework-neutral. If the conversational visual designer later demands a React application, Londos can add a dedicated design frontend that reads/writes LSS while retaining the Django domain backend.

Likewise, public shops can later move to another renderer without changing the canonical LSS contract.

## Proposed pilot stack

- **Backend/web:** Django 6, ASGI-capable deployment.
- **Canonical DB:** PostgreSQL.
- **Public rendering:** Django server rendering + reusable LSS component partials; minimal progressive JS.
- **CSS:** lightweight utility/component approach; exact choice to benchmark.
- **Background jobs:** Django Tasks contract where useful + production-capable external worker/backend selected during implementation.
- **Cache:** add Redis only when a measured need or worker backend requires it; do not make it mandatory for first local prototype.
- **Search:** PostgreSQL full-text/indexed search for pilot; abstract behind a SearchService interface.
- **Media:** object storage semantics + background image variants + CDN in production.
- **AI designer:** separate application/domain service boundary inside the monolith initially; provider-independent; emits LSS patches only.
- **Deployment:** container-ready but no Kubernetes.
- **Observability:** structured logs, error tracking, health checks, metrics appropriate to budget.

## What we deliberately reject for v1

- Kubernetes;
- microservices;
- Elasticsearch/OpenSearch by default;
- separate database per shop;
- SPA-only public storefront;
- arbitrary tenant JavaScript;
- AI in public rendering path;
- local mini PC as sole production host.

## Benchmark gate

Before calling this final, build a thin vertical prototype that proves:
1. render one LSS shop server-side;
2. render 20 search results;
3. deep-link from search to shop department/product context;
4. update product and invalidate/re-render affected shop state;
5. upload a large image and generate variants asynchronously;
6. enforce cross-tenant authorization tests;
7. measure public HTML/JS/image transfer and response time;
8. simulate at least 1,500 shops / representative product counts in PostgreSQL.

If the prototype fails its performance or design requirements, revisit Candidate B.
