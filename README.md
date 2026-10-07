# Londos

> **Working concept:** a digital mall where businesses rent autonomous digital shop space inside a shared commercial destination.

**Status:** P12 is preserved. The P13/G5 development packet now adds 12 fictional merchant accounts with native-MFA admin removal, guarded Brevo delivery, optional services and pilot/launch reporting. **PostgreSQL remains active; no MongoDB migration was performed.** MongoDB public copies, Redis and Cloudinary are manually enabled and default off. The current schema is **019**; applied 001–018 are unchanged. Read [current evidence](docs/evidence/G5-P13.md), [deployment profiles](docs/DEPLOYMENT-PROFILES.md), [pilot runbook](docs/PILOT-RUNBOOK.md) and [BUILD-STATUS](docs/BUILD-STATUS.md). Production G5 and real P13 outcomes remain open. Development rent stays **UGX 5,000 per 30 days, seven-day grace, manual reconciliation; live collection disabled**. The build follows [prompt.txt](prompt.txt).

## Recommendations

**Current integration check:** 149 targeted tests passed; [results and limits](docs/evidence/SERVICES-2026-10-07.md). `MONGODB_URL` is now supported, but the real value has not reached this running environment, so Atlas is not verified. **Redis is optional; leave it disabled/unset.** Use [first local setup](docs/LOCAL-FIRST-SETUP.md), [Render setup](docs/RENDER-SETUP.md), and [Cloudinary image linkage](docs/CLOUDINARY-MEDIA.md). Real Cloudinary/Brevo acceptance remains unverified. Earlier [mock evidence](docs/evidence/OPTIONAL-SERVICES-MOCK.json) remains historical.

Use **Sol 6.1 High** for the foundation, ordinary interface work, routine tests and documentation. Use **Sol 6.1 Extra High** for schema/migrations, tenant isolation, financial correctness, concurrency, safe LSS and AI boundaries. Use **6 Astra Extra High** for critical architecture/security and release reviews.

The assistant records progress and reminders at model boundaries. You control the selector; the latest reported setting is **6 Astra Extra High**. Model recommendations do not block work you already authorized. See [RECOMMENDATIONS](RECOMMENDATIONS.md) for the full workflow, [the implementation plan](docs/IMPLEMENTATION-PLAN.md) for task dependencies, and [BUILD-STATUS](docs/BUILD-STATUS.md) for the next action.

## Run the public preview

Use Node 24.19.0 and npm 11.9.0. From the repository root:

```bash
npm ci --no-fund
npm run dev
```

For production-mode validation, run `npm run build` then `npm run start`. Run `npm run check` for the initial checks. See [DEVELOPMENT](docs/DEVELOPMENT.md) for browser tests, configuration and standalone startup.

Public browsing defaults to fictional fixtures. With the configured local core and `LONDOS_DATA_SOURCE=database`, X2 renders eligible published PostgreSQL shops, bounded shop-first search and processed ready images. Merchants can edit catalogues/contacts, upload private images, save safe manual designs, preview privately and explicitly publish immutable revisions. Opted-in guest enquiries have a scoped private inbox and local notifications. Owners can now apply with private evidence; scoped MFA operators review and manually reconcile development rent, provision shops and manage credit reversals. Scheduled reminders, grace/closure and verified renewal preserve moderation. The private manual/deterministic AI design workflow and bounded semantic registry are implemented; purchases, live rent/providers and production release remain separate gates.

To add the authorized fictional cohort, run `npm run db:demonstration` after migration/seed. Credentials remain in private ignored `.local/demonstration-accounts.json`. An operations operator with fresh native MFA can remove these accounts from **Landlord → Demonstration accounts**; business history is retained. No real participants or paid renewals are fabricated. Brevo uses the proposed sender **mnelsontravor@gmail.com**; its key and verified delivery remain outstanding. See [deployment profiles](docs/DEPLOYMENT-PROFILES.md) for exact configuration and optional-service limits.

For the full local environment, run `npm run db:local`, `npm run db:migrate`, `npm run db:seed`, then build and start the web and `npm run worker` in separate terminals. Run `npm run db:p8` for development reconciliation and `npm run db:operations` for local shop administration after migration/seed; these explicitly grant only the existing fictional operator. `npm run db:trust` explicitly enables local moderation and preserves a separate fictional reviewer in ignored `.local/trust-reviewer.json` for independent appeals. `npm run db:incidents` explicitly adds recovery/support to the verified fictional operator for assigned incident triage. Ordinary seed grants remain unchanged; real MFA and separate scope claims are required. Local credentials are random and stored only in ignored private files. See [DEVELOPMENT](docs/DEVELOPMENT.md) for guarded setup, sign-in and verification.

Owners can manage teams, accept private invitations, grant staff access per shop and change shop addresses while retaining old links. Scoped MFA operators can view occupancy and finance exceptions, move shops between malls and pause/resume visibility with reasons and audit. Resume still requires valid tenancy, publication and moderation. Read [P8 administration evidence](docs/evidence/X2-P8-ADMIN.md) and [lifecycle evidence](docs/evidence/X2-P8.md).

Customers can report fictional shop concerns without an account and attach one private normalized image. Separately scoped MFA reviewers investigate, suspend and independently reinstate; owners see redacted decisions and can appeal. Reports never automatically close shops, and restoration preserves other cases, rent, publication and administrative holds. A platform-derived “Development application reviewed” disclosure states its limited local meaning. Read [P9 evidence](docs/evidence/X2-P9.md), [trust ADR](docs/ADR/0008-local-reporting-and-trust-review.md) and [X2 handoff](docs/X2-HANDOFF.md). Fresh owners can also open incidents, and assigned MFA reviewers can investigate, escalate and revoke the reporting owner’s sessions. Contact/payment-instruction recovery requires that same owner’s fresh confirmation of an exact historical revision, then restores it as a new version. Ordinary support cannot perform sensitive recovery. Read [incident evidence](docs/evidence/X2-P9-INCIDENTS.md) and [recovery ADR](docs/ADR/0009-local-incidents-and-owner-confirmed-recovery.md). Lost-all-factor identity recovery remains unavailable pending an approved proof policy.

Local analytics captures nine public observations with observed direct/discovery/unattributed source; publication and catalogue counts derive separately from committed audit history. Fresh owners see only their shop aggregates; an explicitly granted analytics operator with native fresh MFA sees bounded cohort, renewal and backlog summaries. Counts measure observations/contact intent, not unique customers or completed sales. Capture is disabled by default: in configured loopback database mode, set `LONDOS_PILOT_ANALYTICS=true` for fictional development browsing; `LONDOS_PILOT_RETENTION_DAYS` accepts 7–90 UTC calendar days (default 30). After migration/seed, `npm run db:analytics` explicitly grants analytics only to the verified fictional operator, preserving ordinary seed grants and credentials. Live analytics remains disabled. Read [analytics evidence](docs/evidence/X2-P9-ANALYTICS.md), [ADR-0010](docs/ADR/0010-local-pilot-analytics.md) and [illustrations](docs/ILLUSTRATIONS.md). Live policies/providers and full-build/release gates remain open.

Fresh owners also have [bounded business exports and governed local privacy review](docs/evidence/X2-P9-PRIVACY.md). A separate native-fresh-MFA privacy reviewer claims requests, manages exact-target holds and approves only eligible mature fictional primary-data effects. Erasure defaults off; the main runtime keeps it off and live erasure remains disabled. Financial/account/investigation/audit history, physical backup handling and full legal subject-access remain explicit boundaries. See [ADR-0011](docs/ADR/0011-local-privacy-governance.md) and [recovery instructions](docs/FAILURE-RECOVERY.md).

Fresh owners can view their current managed-media bytes, recorded quota and shop-bound queue counters. An explicitly enabled costs operator with native fresh MFA sees platform totals; a separate shop scope permits reporting support, verification and rent-collection minutes and UGX expenses, with immutable exact corrections. Reports distinguish logical snapshots, operator-reported work and unavailable bandwidth/AI/provider prices; they never bill merchants. After migration/seed, guarded `npm run db:costs` adds only the fictional operator’s costs grant. Read [cost evidence](docs/evidence/X2-P9-COSTS.md), [ADR-0012](docs/ADR/0012-local-resource-cost-reporting.md) and [illustrations](docs/ILLUSTRATIONS.md). P10 now adds bounded provider-reported token/configured-estimate aggregates separately from actual bills. P11 validation is complete locally; [P11 evidence](docs/evidence/X2-P11.md) records the historical 372-test gate and external obligations.

P10's [private design assistant and local gate](docs/evidence/X2-P10.md) are complete: supported merchant instructions produce a validated unsaved preview, explicit application creates a draft, and publication remains a separate confirmed action. Deterministic edits need zero provider calls. Closed Gemini/OpenAI contracts, durable retries/budgets/cooldowns, expiry and current authority checks constrain remote proposals. P10's historical 344-test/schema-017 packet is preserved. P11 now completes the bounded semantic registry, full catalogue continuation, two-replica load/recovery and clean upgrade verification. **P11 passed 372 tests; R2 now passes 390 and preserves schema 018/data.** Both live providers still need secure active bindings and live model contracts; published rates and the required OpenAI model correction are recorded; [provider setup](docs/AI-ENVIRONMENT.md) records the actual zero-call check. Read [P11 evidence](docs/evidence/X2-P11.md), [ADR-0014](docs/ADR/0014-bounded-semantic-spaces-and-catalogue-pagination.md) and [R2 handoff](docs/X2-HANDOFF.md).

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

| Surface    | Audience         | Purpose                                                                     |
| ---------- | ---------------- | --------------------------------------------------------------------------- |
| Mall       | Public           | Discovery, categories, global search, directories                           |
| Shop       | Public           | Merchant-controlled commercial premises                                     |
| Shopkeeper | Merchant/private | Inventory, design, messages, analytics, rent, settings                      |
| Landlord   | Operator/private | Applications, verification, tenancy, rent, reports, safety, mall operations |

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

- [First local installation and usage](docs/LOCAL-FIRST-SETUP.md)
- [Initial Render setup](docs/RENDER-SETUP.md) and [offline checklist](render.html)
- [Cloudinary media storage and MongoDB linkage](docs/CLOUDINARY-MEDIA.md)
- [Current provider integration verification](docs/evidence/SERVICES-2026-10-07.md)

- [Model recommendations and handoffs](RECOMMENDATIONS.md)
- [Implementation plan](docs/IMPLEMENTATION-PLAN.md)
- [Build status and next model setting](docs/BUILD-STATUS.md)
- [Development setup](docs/DEVELOPMENT.md)
- [System and journey illustrations](docs/ILLUSTRATIONS.md)
- [Current Next.js / Node architecture ADR](docs/ADR/0002-nextjs-node-application-architecture.md)
- [Identity and durable jobs ADR](docs/ADR/0003-identity-and-durable-jobs.md)
- [Reviewed security contracts](docs/X1-SECURITY.md)
- [X1 verification evidence](docs/evidence/X1-STAGE.md)
- [R1 findings, fixes and verification](docs/evidence/R1-REVIEW.md)
- [X2 implementation handoff](docs/X2-HANDOFF.md)
- [P8 local lifecycle verification and screenshots](docs/evidence/X2-P8.md)
- [P9 incident ownership and owner-confirmed recovery evidence](docs/evidence/X2-P9-INCIDENTS.md)
- [Local incident and recovery ADR](docs/ADR/0009-local-incidents-and-owner-confirmed-recovery.md)
- [P8 administration verification and screenshots](docs/evidence/X2-P8-ADMIN.md)
- [Local administration and shop addresses ADR](docs/ADR/0007-local-administration-and-shop-addresses.md)
- [Local applications and rent lifecycle ADR](docs/ADR/0006-local-applications-and-rent-lifecycle.md)
- [X2 P5 verification and screenshots](docs/evidence/X2-P5.md)
- [X2 P6–P7 verification, scale measurements and screenshots](docs/evidence/X2-P6-P7.md)
- [Safe design and canonical public reads ADR](docs/ADR/0005-safe-design-and-canonical-public-reads.md)
- [Catalogue/contact/private-media ADR](docs/ADR/0004-catalogue-contact-and-private-media.md)
- [Domain contracts for review](docs/CONTRACTS.md)
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
