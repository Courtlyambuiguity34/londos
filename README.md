# Londos

> **Working concept:** a digital mall where businesses rent autonomous digital shop space inside a shared commercial destination.

**Status:** Sol 6.1 High foundation complete; awaiting Sol 6.1 Extra High for secure persistence, authentication and jobs. The current build follows the Next.js / TypeScript / Node.js / PostgreSQL instruction in [prompt.txt](prompt.txt). Track verified capabilities and the next model setting in [BUILD-STATUS](docs/BUILD-STATUS.md).

## Recommendations

Use **Sol 6.1 High** for the foundation, ordinary interface work, routine tests and documentation. Use **Sol 6.1 Extra High** for schema/migrations, tenant isolation, financial correctness, concurrency, safe LSS and AI boundaries. Use **6 Astra Extra High** for critical architecture/security and release reviews.

The assistant will record progress and remind you at each model boundary. You control the model selector and confirm the change before the next stage starts. See [RECOMMENDATIONS](RECOMMENDATIONS.md) for the full workflow, [the implementation plan](docs/IMPLEMENTATION-PLAN.md) for task dependencies, and [BUILD-STATUS](docs/BUILD-STATUS.md) for the next action.

## Run the public preview

Use Node 24.19.0 and npm 11.9.0. From the repository root:

```bash
npm ci --no-fund
npm run dev
```

For production-mode validation, run `npm run build` then `npm run start`. Run `npm run check` for the initial checks. See [DEVELOPMENT](docs/DEVELOPMENT.md) for browser tests, configuration and standalone startup.

The current stage uses fictional, read-only shops and illustrated products. It does not accept purchases/enquiries or provide merchant/operator accounts. [BUILD-STATUS](docs/BUILD-STATUS.md) distinguishes this foundation from the later database, security, rent, LSS and AI work.

## What Londos is

Londos applies the logic of commercial real estate to the internet. A merchant does not merely upload products into a giant anonymous catalogue. The merchant rents a **shop** in a digital mall, controls that shop's identity and commercial terms, and benefits from the mall's shared discovery traffic and infrastructure.

A customer can:
- enter Londos and discover shops through search/categories;
- visit a shop directly from a merchant's shared link;
- enter a relevant department when search matches a product;
- continue walking through that shop and discover other products;
- contact or transact with the merchant using the methods that merchant enables.

A merchant can:
- apply to rent a shop;
- design it using guided templates, conversational design, or an approved professional designer;
- create departments and add products/services;
- choose contact, payment and delivery terms;
- publish and share a direct shop address;
- manage the shop privately through **Londos Shopkeeper**.

The platform operator manages the commercial property through **Londos Management / Landlord**.

## Product constitution

These principles should not be casually changed during implementation:

1. **The shop is the fundamental commercial identity.**
2. Products and services belong to shops, not to an anonymous platform catalogue.
3. Search may discover a shop through what it contains.
4. A product/category search result should enter the selected shop in the relevant context, while preserving freedom to browse the rest of the shop.
5. Customers should not need an account merely to enter, browse, search, call, WhatsApp, enquire, or use merchant-supported purchasing flows.
6. Merchants control their commerce terms. Londos initially provides infrastructure and discovery rather than becoming compulsory payment custodian.
7. Merchant payments are not held by Londos by default.
8. The recurring merchant charge is **rent for digital commercial space**, not “website hosting.”
9. Public Mall/Shop surfaces are separate from private Shopkeeper and Landlord environments.
10. Merchants get extensive design freedom, but cannot compromise the safety, performance, privacy or structural integrity of the mall.
11. Conversational shop design should be usable by merchants who have no software-design knowledge.
12. Internal mall partitions must not make customers or merchants feel disadvantaged.
13. Architecture should permit very large future scale while initial deployment remains simple and inexpensive.
14. The browser never downloads the mall. It downloads only the entrance, current corridor/search results, and current shop resources needed now.
15. The provisional operational planning target is about **1,500 shops per logical mall**. This is a business/operational partition, not a hard technical database limit.

## Domain model

```text
Londos Platform
└── Mall (logical/internal commercial partition)
    └── Shop
        ├── Department
        │   └── Product / Service
        ├── Media
        ├── Contact & commerce configuration
        ├── Shop design/configuration
        └── Analytics
```

Every shop has a unique immutable identifier such as `SHOP-UG-00000451`. Human-friendly slugs may change; the underlying identity must not.

## Four product surfaces

| Surface | Audience | Purpose |
|---|---|---|
| Mall | Public | Discovery, categories, global search, directories |
| Shop | Public | Merchant-controlled commercial premises |
| Shopkeeper | Merchant/private | Inventory, design, messages, analytics, rent, settings |
| Landlord | Operator/private | Applications, verification, tenancy, rent, reports, safety, mall operations |

## Search philosophy

Search should preserve shop identity.

Example: a customer searches **shoes**. Londos returns relevant shops that contain matching shoes. Selecting Annette's result can land at Annette's shoes department or matching product context. The customer is then inside **Annette's shop** and may browse dresses, handbags or anything else Annette sells.

Search scopes:
1. **Global** — across all public/eligible shops in Londos.
2. **Department/category** — e.g. Fashion, Electronics, Restaurants.
3. **Shop-local** — only the current shop.

Internal Mall 1 / Mall 2 / Mall 3 assignments should normally be invisible to customers. A global directory searches across those partitions.

## Performance principle

A large database must not imply a large webpage.

Londos should use:
- indexed/scoped queries;
- paginated/batched results (initial design target around 20, subject to testing);
- lazy-loaded media;
- responsive image variants;
- caching;
- CDN delivery for public static/media assets;
- a dedicated search/index layer when scale warrants it;
- immediate database updates plus targeted cache invalidation;
- background work for expensive media/index/analytics jobs.

**Performance requirement:** a customer on an ordinary Ugandan mobile connection should never have to download the mall to enter the mall.

## Merchant tenancy lifecycle

```text
Apply
→ landlord review / verification
→ approval
→ first rent payment
→ shop ID + internal mall assignment
→ design shop
→ create departments/catalogue
→ choose contact/payment/delivery terms
→ publish
→ direct sharing + mall discovery
→ customer engagement
→ analytics
→ renewal reminders
→ renewal OR grace period
→ temporary closure/suspension if unresolved
→ reopen on valid renewal
```

Closing for arrears should not immediately destroy the merchant's shop data.

## Shop design

The primary design experience should feel like talking to an interior designer:

> “I sell women's clothes and shoes. Put new arrivals first, dresses near the entrance, shoes separately, use an elegant style, and keep WhatsApp visible.”

The system converts intent into a **safe structured shop specification**, not arbitrary production code.

Merchants may also:
- choose category-aware shop designs/templates;
- iteratively redesign by conversation;
- hire approved designers/developers.

Advanced designers can eventually use a constrained **Londos Shop SDK**: approved components, theming/CSS boundaries, shop/product APIs, media/3D viewers and safe animation. Arbitrary server processes, cross-shop access, direct database access and unrestricted scripts are outside the tenant boundary.

## Commerce boundary

Initially, Londos should allow merchants to configure methods such as:
- Call Shop;
- WhatsApp Shop;
- in-shop enquiry/message;
- reservation/order request;
- cash on delivery;
- pay on pickup;
- Mobile Money after merchant confirmation;
- deposit/pre-order arrangements.

Londos may recommend safer/better practices, but should not force one checkout model before evidence justifies it.

## Documentation map

- [Model recommendations and handoffs](RECOMMENDATIONS.md)
- [Implementation plan](docs/IMPLEMENTATION-PLAN.md)
- [Build status and next model setting](docs/BUILD-STATUS.md)
- [Development setup](docs/DEVELOPMENT.md)
- [System and journey illustrations](docs/ILLUSTRATIONS.md)
- [Current Next.js / Node architecture ADR](docs/ADR/0002-nextjs-node-application-architecture.md)
- [Domain contracts for X1 review](docs/CONTRACTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Product & UX](docs/PRODUCT.md)
- [Data & tenancy](docs/DATA-MODEL.md)
- [Search, performance & media](docs/PERFORMANCE.md)
- [Security & trust](docs/SECURITY.md)
- [Infrastructure & scaling](docs/INFRASTRUCTURE.md)
- [End-to-end architecture stress test](docs/STRESS-TEST.md)
- [Unit economics & rent stress test](docs/ECONOMICS.md)
- [Failure & recovery requirements](docs/FAILURE-RECOVERY.md)
- [Technical Specification v0](docs/TECHNICAL-SPEC-V0.md)
- [MVP & validation roadmap](docs/MVP.md)
- [Business model & revenue architecture](docs/BUSINESS-MODEL.md)
- [Automation & landlord operations](docs/AUTOMATION-OPERATIONS.md)
- [Search ranking principles](docs/SEARCH-RANKING.md)
- [First pilot experiment](docs/PILOT-EXPERIMENT.md)
- [Technology stack selection criteria](docs/STACK-CRITERIA.md)
- [Londos Shop Specification (LSS)](docs/SHOP-SPECIFICATION.md)
- [Illustrative LSS JSON Schema](docs/SHOP-SPEC-SCHEMA-V0.1.json)
- [Conversational shop-design pipeline](docs/SHOP-DESIGN-PIPELINE.md)
- [Component building code](docs/COMPONENT-BUILDING-CODE.md)
- [Stack comparison](docs/STACK-COMPARISON.md)
- [Vertical architecture prototype](docs/VERTICAL-PROTOTYPE.md)
- [ADR-0001: initial application architecture](docs/ADR/0001-initial-application-architecture.md)
- [Architecture decisions](docs/DECISIONS.md)

## Current phase

The owner authorized implementation. Begin with an executable, tested public foundation, then move through the plan's security, data, merchant/operator, design, rent and release gates using the model handoffs above. Current-stage completion is distinct from complete-build or production readiness.

The architecture should be able to grow toward millions of users and many thousands of shops, but the first deployment should pay only for the scale that actually exists.
