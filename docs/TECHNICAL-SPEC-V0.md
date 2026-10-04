# Technical Specification v0

**Status:** architecture contract under implementation. The current Next.js / TypeScript / Node.js / PostgreSQL direction is defined in [ADR-0002](ADR/0002-nextjs-node-application-architecture.md).

This specification defines required behavior. Vendor and deployment choices remain evidence-driven; follow the selected stack and track verified capabilities in [BUILD-STATUS](BUILD-STATUS.md).

## 1. Public capabilities

### Mall entrance
- no authentication required;
- category navigation;
- global search;
- bounded/paginated results;
- shop-first result presentation;
- direct routing into relevant shop context.

### Public shop
- stable public address;
- merchant identity/verification indicators as policy defines;
- departments;
- products/services;
- optimized media;
- shop-local search where enabled;
- merchant-configured commerce/contact actions;
- fast mobile-first rendering;
- clear closed/suspended/unavailable states.

## 2. Shopkeeper capabilities

- merchant authentication;
- authorization by shop membership/role;
- MFA policy;
- shop profile;
- department CRUD;
- product/service CRUD;
- media upload and processing state;
- shop design specification and preview;
- publish/version/rollback foundation;
- contact/commerce configuration;
- rent/tenancy state;
- basic analytics;
- security/audit visibility for sensitive changes.

## 3. Landlord capabilities

- mandatory MFA;
- application queue;
- approve/reject/request-review;
- merchant/shop verification;
- immutable shop identity allocation;
- logical mall assignment/capacity;
- tenancy/rent state;
- grace/close/reopen;
- moderation/report queue;
- audit trail;
- occupancy and operational health.

## 4. Required state machines

### Application
`draft/submitted → reviewing → approved | rejected | needs_information`

### Shop
`provisioning → unpublished → active → temporarily_closed | suspended | archived`

### Tenancy
`pending → active → due → grace → closed → active`

Exact transitions/policy timers require review. State changes are server-controlled and audited.

### Media
`uploaded → validating → processing → ready | rejected | failed`

## 5. Core invariants

- every protected shop mutation is authorized server-side;
- shop ID is immutable;
- slug/name changes do not break canonical identity;
- products cannot exist without a shop;
- department/product visibility cannot make a closed/suspended shop globally eligible;
- internal mall assignment does not create arbitrary search-ranking advantage;
- rent/payment callbacks are idempotent;
- destructive deletion is separate from non-payment closure;
- public shop rendering cannot execute arbitrary tenant server code;
- canonical DB is not replaced by search/cache.

## 6. Event boundaries

The first implementation may be a modular monolith, but should emit/handle conceptual events such as:
- ShopApproved
- TenancyActivated
- ShopPublished
- ShopClosed
- ProductChanged
- MediaUploaded
- MediaReady
- ShopContactChanged
- RentDue
- RentPaid
- ReportCreated
- ShopSuspended

These can initially be in-process/outbox-backed jobs. The point is to preserve boundaries and reliable side effects, not to introduce a distributed event bus prematurely.

## 7. Consistency

Strong correctness is required for:
- authentication/authorization;
- shop ownership/membership;
- rent ledger;
- tenancy/suspension;
- canonical catalogue writes.

Eventual consistency is acceptable within defined freshness objectives for:
- search index;
- caches;
- analytics;
- media derivatives.

## 8. Search contract

Input can include query, category, filters, pagination cursor and locale.

Search must:
1. filter ineligible shops;
2. retrieve matching public content;
3. aggregate/present results without destroying shop identity;
4. avoid domination by one spammy tenant;
5. return bounded results;
6. provide routing context into the shop.

## 9. Media contract

Uploads have:
- owner/shop;
- media ID;
- source metadata;
- processing state;
- variants;
- storage accounting;
- safety/validation result.

Public pages reference optimized variants.

## 10. Observability

From the first production pilot collect:
- request latency/errors;
- DB query health;
- search latency/errors;
- worker queue depth/age;
- media processing failures;
- cache performance;
- storage/bandwidth;
- auth/security events;
- shop/customer funnel metrics;
- per-shop variable resource cost where practical.

## 11. Data portability

Architecture should permit:
- merchant data export under policy;
- backup/restore;
- search-index rebuild;
- migration between physical infrastructure without changing public shop identity.

## 12. Deployment requirement

Production must not have the user's local mini PC as its sole availability dependency. Owner-controlled hardware can provide encrypted independent backup/recovery and development functions.

## 13. Production implementation gate

Before production rollout and selecting remaining vendors/policies, validate:
- expected pilot traffic;
- media volume;
- payment/rent collection approach;
- required languages/localization;
- merchant verification policy;
- privacy/data requirements;
- deployment budget;
- expected developer/operator capacity.

Validate the chosen Next.js / Node / PostgreSQL direction against this specification and choose the simplest supported deployment shape. Any proposed framework change requires a new documented decision rather than silently reviving a superseded proposal.
