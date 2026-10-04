# Architecture Decision Register

This file distinguishes **settled principles**, **working hypotheses**, and **open decisions**.

## Settled principles

- Product metaphor: digital mall / commercial real estate.
- Shop is the primary commercial identity.
- Products/services belong to shops.
- No forced customer account for ordinary public browsing.
- Search preserves shop identity and can deep-link into relevant shop context.
- Public Mall/Shop and private Shopkeeper/Landlord are separate surfaces.
- Merchants control commerce terms within mall rules.
- Londos does not hold merchant money by default in the initial model.
- Merchant recurring fee is framed as rent.
- Unique immutable shop IDs.
- Strong tenant isolation.
- Conversational shop design is the preferred long-term merchant design interaction.
- Arbitrary tenant executable code is not permitted in the core mall environment.
- Internal mall partitions should normally be invisible to customers.
- Global search can cross all logical malls.
- Performance comes from scoped retrieval, indexing, caching, pagination and media optimization.
- Production should not depend on one locally hosted mini PC.

## Working hypotheses requiring validation

- Brand: **Londos**.
- Approximately **1,500 shops per logical mall** as an operational planning cap.
- Rent around **UGX 5,000/month** for an entry/small shop.
- Catalogue/media/resource use may influence rent.
- Search result page size around 20.
- 10–20 merchant first validation cohort.
- Hybrid cloud production + owner-controlled encrypted backup strategy.

## Open product decisions

- Exact tenancy application fields and verification standard.
- Grace period and arrears policy.
- Customer messaging/privacy model.
- Merchant roles/staff permissions.
- Exact catalogue/inventory model.
- Location and delivery model.
- Final rent structure.
- Platform commission, if any.
- Integrated payment roadmap.
- Designer ecosystem rules.
- Advertising/promoted discovery rules.
- Reviews/ratings model.

## Open technical decisions

Current direction is **Next.js / TypeScript / Node.js / PostgreSQL**, per the master instruction and [ADR-0002](ADR/0002-nextjs-node-application-architecture.md). The old Django ADR is historical. The foundation uses npm and pins runtime/dependency versions; see `package.json` and `.nvmrc`.

Remaining decisions:
- authentication/MFA library and PostgreSQL schema/query tooling;
- PostgreSQL hosting;
- later dedicated search technology (initial search is PostgreSQL-backed);
- cache/queue;
- media/object storage;
- CDN;
- cloud/provider;
- observability stack;
- rendering/caching strategy;
- AI model/provider for conversational design;
- backup hardware/software;
- deployment automation.

## Decision rule

Do not turn a hypothesis into architecture merely because it appeared in a brainstorm. Record evidence, make the decision, and update this register.

Major irreversible/high-cost decisions should receive an Architecture Decision Record (ADR) before implementation.
