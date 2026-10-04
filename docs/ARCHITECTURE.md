# Londos Architecture

## Current implementation decision

The current build uses **Next.js / TypeScript / Node.js / PostgreSQL**, following the owner's master instruction and [ADR-0002](ADR/0002-nextjs-node-application-architecture.md). The Django proposal is superseded. Public server rendering, separate domain policies, safe LSS and a durable Node worker preserve the logical boundaries below. See [BUILD-STATUS](BUILD-STATUS.md) for capabilities actually verified; the first stage uses fictional read-only fixtures.

## Architectural goal

Build a digital commercial property that can begin with tens of merchants and evolve to many logical malls and very large traffic without redesigning the product metaphor.

## Conceptual system

```text
Customers / Merchant-shared links
            |
     CDN / edge protection
            |
   +--------+---------+
   |                  |
Public Mall       Public Shops
   |                  |
   +--------+---------+
            |
      Application/API
     /      |       \
 Search   Core DB   Workers
 Index      |        |
            |     media/index/
            |     notifications
            |
      Object/media storage
            |
  +---------+----------+
  |                    |
Shopkeeper          Landlord
(private)           (private)
```

This is a logical architecture. It does **not** require separate microservices on day one.

## Boundaries

### Public Mall
Provides the entrance, category/directory navigation, discovery and global search. It must be fast without authentication.

### Public Shop
A tenant-controlled public experience backed by a safe shop specification. Shop pages can be aggressively cached because most public content is read-heavy.

### Shopkeeper
Authenticated merchant control plane. Shopkeepers manage only shops they are authorized to operate. Supports catalogue, design, commerce/contact settings, messages, analytics, rent and publication.

### Landlord
Highly privileged operator control plane. Handles applications, identity/merchant verification, tenancy, rent status, arrears/grace, reports, moderation, mall occupancy and operational controls.

## Logical malls

A logical mall is an internal partition with a provisional planning capacity of about 1,500 shops. It is useful for:
- occupancy and tenancy operations;
- future database/search partitioning;
- capacity planning;
- operational reporting;
- later infrastructure sharding.

It is **not** intended to create public inequality between “Mall 1” and “Mall 4.” Global discovery crosses logical malls.

When necessary, physical infrastructure can later map groups of logical malls to separate database/search clusters without changing public URLs or customer mental models.

## Start simple, preserve boundaries

Initial deployment can be a modular monolith with:
- public web application;
- private Shopkeeper routes/application;
- private Landlord routes/application;
- relational database;
- object/media storage;
- cache;
- background worker/queue;
- search capability appropriate to initial scale.

The code should preserve domain boundaries so components can be separated only when measured load or organizational complexity justifies it.

## Update model

Merchant changes should be committed immediately. After a product/shop change:
1. validate authorization and input;
2. write canonical state;
3. enqueue derivative work where needed;
4. invalidate only affected caches;
5. update relevant search document/index;
6. regenerate affected public representation/variants.

Do not rebuild every shop or wait until end-of-day for ordinary price/stock/catalogue changes.

## Availability principle

No single merchant/customer request should depend on downloading or querying unrelated tenants. Failures in analytics, media transformation or optional features should not unnecessarily block the storefront.

## Decisions still open

- cloud provider;
- PostgreSQL hosting and schema/query tooling;
- later dedicated search engine (pilot search begins with PostgreSQL);
- cache/queue products;
- object-storage/CDN vendor;
- exact deployment topology;
- exact SSR/cache/revalidation policy within the server-rendered Next.js direction.

Choose these after requirements/benchmarks, not because they are fashionable.
