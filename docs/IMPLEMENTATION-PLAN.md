# Londos implementation and release plan

Status: implementation authorized; progress and model handoffs are tracked in [BUILD-STATUS](BUILD-STATUS.md) and [RECOMMENDATIONS](../RECOMMENDATIONS.md).

Prepared: 2026-10-04. Repository baseline: `2d8d587f5dd4d9bc57e631043486351fd4419aa2`.

## 1. What this plan is based on

This plan covers the README, all 23 existing Markdown documents under `docs/`, the illustrative LSS JSON schema, and the complete [master build instruction](../prompt.txt). The baseline contains documentation and a schema, with no application, dependency manifest, migrations, CI pipeline, or application tests. Earlier environment checks establish documentation/schema validity, not application readiness.

The goal is to build a secure, usable digital mall through small, verifiable increments. No plan can guarantee zero defects. The safeguards here make failures detectable, contain their impact, protect data, and provide a tested recovery path.

### Source precedence and a significant conflict

`prompt.txt` explicitly supersedes the Django proposal with **Next.js + TypeScript + Node.js + PostgreSQL**. It also requires provider-neutral conversational design with Gemini and selective OpenAI review/fallback. Those instructions govern this plan. The existing [Django ADR](ADR/0001-initial-application-architecture.md) and [stack comparison](STACK-COMPARISON.md) remain historical evidence; their Django recommendation is not the current build target.

The first implementation change must record a new ADR and reconcile the architecture/decision documents. Preserve the earlier ADR and mark it superseded. Keep its useful security, performance, and vertical-prototype criteria, translated to the chosen stack. Do not silently change stacks again if a benchmark fails: investigate, optimize, and document any proposed architectural change.

The owner authorized the build after this plan was prepared, then requested staged model handoffs. Execute the currently confirmed stage and pause at each recorded model boundary. Production deployment still requires the explicit authorization described in the master instruction.

### Three distinct milestones

| Milestone | What it proves | What it does not prove |
|---|---|---|
| Architecture prototype | The highest-risk paths work together on representative synthetic data. | A complete merchant product, production security, or business viability. |
| Pilot release candidate | The core merchant/customer/operator lifecycle is usable, secure, observable, and recoverable for 10–20 merchants. | Large-scale demand, sustainable rent, or all external integrations being enabled. |
| Complete requested build | All capabilities in `prompt.txt` have evidence, including safe AI design and deployment preparation. | Production deployment or publication without owner authorization. |

Templates/manual design can support an explicitly limited pilot if AI credentials are unavailable. That exception must be recorded; it cannot be used to declare the complete requested build finished. A mocked payment, notification, storage, or AI integration is not a verified live integration.

## 2. Product rules that every phase must preserve

Assign these IDs to acceptance tests and PRs so changes remain traceable.

| ID | Invariant |
|---|---|
| I01 | The hierarchy is Platform → Mall → Shop → Department → Product/Service. Shops retain their commercial identity. |
| I02 | Customers can browse, search, follow deep links, call, use WhatsApp, and submit an ordinary enquiry without an account. |
| I03 | Every protected read and mutation checks the actor, action, shop membership, and target resource on the server. |
| I04 | Shop identity is immutable; changing a name, slug, or internal mall preserves identity and controlled URL continuity. |
| I05 | Public eligibility derives from publication, tenancy, moderation, and resource visibility. A design or payment cannot bypass suspension. |
| I06 | Canonical PostgreSQL records own catalogue, contact, tenancy, and financial truth. Search, caches, LSS, and AI never replace them. |
| I07 | Rent processing, activation, scheduled transitions, and external-event handling are idempotent. Non-payment closure retains data. |
| I08 | Tenant content cannot execute arbitrary code, access another tenant, override platform safety UI, or supply unrestricted styles/queries. |
| I09 | Design changes require validation, preview, explicit publication, immutable revision history, and conflict detection. |
| I10 | Discovery presents shops, bounds results, prevents one shop from dominating, and gives no organic advantage to internal mall assignment. |
| I11 | Public pages have bounded queries/media and do not download the mall. One shop update does not flush all shops. |
| I12 | Rendering an existing public shop makes zero AI calls. AI/analytics/worker failures do not unnecessarily disable browsing. |
| I13 | Merchants control approved commerce terms. Londos does not introduce a platform wallet or merchant-payment custody in this build. |
| I14 | Landlord access requires working MFA before live use; sensitive changes use step-up authentication and audit history. |
| I15 | Production has tested encrypted recovery, least-privilege credentials, and does not depend solely on a local mini PC. |

## 3. Resolve decisions before their dependent work

Record each decision with owner, date, rationale, alternatives, and evidence in the decision register or an ADR. The owner may be one person wearing several roles. Reversible engineering choices should proceed with documented defaults. Unresolved financial, deletion, or production policy must remain explicit rather than being guessed into live behavior.

| Decision | Recommended working position | Needed by | Decision owner / completion evidence |
|---|---|---|---|
| D01: framework and runtime | Next.js App Router, strict TypeScript, supported Node LTS, PostgreSQL; pin mutually compatible supported releases at implementation time. | P0/P1 | Engineering; new ADR and version compatibility check. |
| D02: package manager, database access, auth library | One package manager/lockfile; typed migrations/queries; maintained auth library with supported sessions, recovery, MFA, and revocation. Avoid custom cryptography. | P1/P2 | Engineering/security; short selection record and working integration tests. |
| D03: durable job backend | Evaluate a PostgreSQL-backed Node queue first to limit services; choose a Redis-backed queue only if required capabilities justify it. Separate worker process either way. | P1/P4 | Engineering; retry, concurrency, scheduling, and crash-recovery demonstration. |
| D04: application and shop activation | Approval permits first rent. Verified first payment or a separately authorized, audited waiver activates tenancy and provisions the shop idempotently. | P2/P8 | Product/operator; transition table, invoice/reference design before a shop exists. |
| D05: merchant roles | Owner and restricted staff initially; explicit permissions for catalogue, design, publishing, finance, and sensitive settings. Operator privileges are separate. | P2/P3 | Product/security; action-by-role matrix, ownership-transfer rules. |
| D06: catalogue | Products and services, explicit availability, currency-aware prices; decide variants, stock tracking, price-on-request, and service scheduling before schema stabilization. | P2/P5 | Product; examples for fashion, electronics, food, and a service business. |
| D07: rent and collection | Configurable obligations and append-only financial events. UGX 5,000 remains a hypothesis. Manual verified reconciliation can precede a provider integration. | P8 | Owner/finance; price, tax treatment, fees, partial/overpayment/reversal and reconciliation policy. |
| D08: tenancy timing | Explicit due dates, grace, notices, closure, reopening, waivers, and treatment of disputed payments. Store timestamps consistently; apply agreed local business time. | P8 | Owner/operations; policy fixtures covering boundaries and missed jobs. |
| D09: verification/moderation | Define required evidence, badge meaning, prohibited goods, review/appeal and suspension authority. Automation assists consequential human decisions. | P8/P9 | Owner/trust; published rules and operator playbook. |
| D10: privacy, retention, portability | Minimize verification/enquiry/analytics data; define access, retention, export, deletion, legal holds, and backup expiry implications. | P2 design; before live data | Owner/privacy; policy appropriate to operating markets and data map. |
| D11: languages and locations | Prepare localization boundaries, currency/time formatting, and explicit service/delivery areas. Agree pilot languages from actual merchant needs. | P5/P7 | Product; pilot locale and query examples. |
| D12: hosting and communication providers | Cloud deployment with a persistent worker, managed/simple PostgreSQL, object storage/CDN, and selected email/SMS where needed. | P1 design; P12 integration | Owner/engineering; budget, region, supported runtime, credentials and domain ownership. |
| D13: resource and AI allowances | Set catalogue, media, request, job and AI budgets per shop; no unlimited lowest-rent promise. | P4/P5/P10 | Product/engineering; measured cost envelope and clear exceeded-limit behavior. |
| D14: performance/freshness/recovery targets | Adopt provisional test budgets in section 9; agree launch targets, load profile, and RPO/RTO separately. | Before P6 measurement; P12 release | Engineering/operator; benchmark contract and restore drill. |
| D15: AI providers | Gemini initial provider when configured; deterministic edits first; selective OpenAI review/fallback with consent/policy and cost limits. | P10 | Owner/engineering; provider terms, secret bindings, model selection and live contract checks. |

Planning does not require collecting these answers immediately. P0 records them, identifies which are blocking, and schedules the decision before its dependent phase. Local development uses clearly marked fixtures and a controllable clock; it must not silently treat fixture policies as approved production policies.

### Gaps to close deliberately

1. **Architecture records disagree.** Reconcile the explicit Next.js decision before scaffolding.
2. **The LSS schema is illustrative.** Component properties allow additional fields; theme/SEO/performance/extensions objects are broadly unconstrained. Schema validity alone proves neither authorization nor safe rendering. Define component-specific schemas, strict token/URL policies, aggregate budgets, semantic checks, and supported versions.
3. **State vocabularies overlap.** Keep application, shop publication, tenancy, and moderation separate. Define their combined eligibility function; do not create one ambiguous `active` or `paid` boolean.
4. **First-payment identity needs an explicit model.** Invoice an approved application/merchant/rent account before the public shop exists; link provisioning atomically after verified payment.
5. **Preview and public data have different rules.** Drafts, verification files, private reports, and unpublished media must never leak through URLs, RSC payloads, caches, search, or object storage.
6. **Security revocation differs from ordinary freshness.** Stale prices can follow a measured freshness objective; suspended-shop eligibility needs a stricter policy. Public CDN caching must not bypass that policy.
7. **Jobs need transactional delivery.** A successful DB write followed by a failed enqueue must remain recoverable through an outbox or equivalent transactional enqueue.
8. **No numeric launch budgets or recovery objectives exist.** Measure and agree them before declaring performance or disaster recovery complete.
9. **The master instruction brings AI into build scope earlier than the MVP document.** Implement it without putting it in the public request path; distinguish pilot enablement from full completion.
10. **Prototype and live credentials are different.** Safe local adapters enable development, but do not establish provider access, email delivery, payment settlement, or production readiness.

## 4. Implementation architecture and contracts

### Application structure

Use a modular monolith with a web process and a separately runnable worker from one repository. A suggested layout, to confirm in P1:

```text
src/app/                 Next.js routes, layouts, route handlers, thin server actions
src/modules/             Domain services, policies, repositories and public interfaces
  identity/ applications/ malls/ shops/ tenancy/ catalogue/
  shop-design/ discovery/ media/ rent/ trust/ analytics/ ai/
src/components/          Platform UI and approved LSS render components
src/server/              Server-only database, sessions, providers and configuration
src/worker/              Job handlers and worker/scheduler entry points
db/                      Schema, migrations and development seed definitions
tests/                   Integration, browser, security, compatibility and performance
scripts/                 Setup checks, seed generation, benchmarks and operational tools
docs/                    Decisions, contracts, setup, evidence and runbooks
```

This is a proposed layout, not a claim that these files already exist. Route groups/layouts distinguish Mall, Shop, Shopkeeper and Landlord, but route organization is not authorization. Enforce policy at every server entry point and in the domain service boundary. Keep domain rules out of React components. Do not import server-only credentials or repositories into client bundles.

Use Node runtime for operations that require database drivers, image processing, or worker libraries. Validate hosting capabilities before choosing edge/serverless execution. Long-running jobs must not rely on an HTTP request or serverless invocation remaining alive.

### Domain ownership and relational safeguards

| Domain | Owns | Required constraints / behavior |
|---|---|---|
| Identity | Users, sessions, MFA enrollment/recovery, organizations, memberships | Revocation, least privilege, unique identities under documented normalization; protect the last owner/operator recovery path. |
| Applications | Applications, evidence references, decisions | Explicit transition/version; private evidence; no public shop from an unapproved application. |
| Malls/shops | Mall assignments, immutable shop IDs, slugs and aliases, membership | Unique immutable identity; collision-safe ID allocation; concurrent capacity assignment; mall reassignment preserves URLs. |
| Catalogue | Departments, products/services, availability, prices | Tenant-consistent foreign keys; indexes beginning with relevant tenant/filter dimensions; exact decimal/minor-unit money representation, never binary floats. |
| Media | Ownership, quarantine keys, processing state, variants and quotas | Shop-scoped references; no unvalidated original made public; atomic quota reservation/accounting. |
| Shop design | Drafts, LSS revisions, published pointer, component/schema versions | Immutable history; unique shop/revision; compare-and-swap publication; canonical catalogue/contact references. |
| Tenancy/rent | Agreements, obligations, invoices, payment/adjustment events, reconciliation | Unique idempotency/provider event keys; auditable append-only corrections; verified events drive entitlement. |
| Discovery | Public projection and query service | Safe fields only; rebuildable/versioned projection; eligibility filtering and shop aggregation. |
| Trust | Verification, reports, cases, restrictions, appeal decisions | Restricted access; reason and actor audit; tenant payment never clears a moderation restriction. |
| Audit | Sensitive action history | Append-oriented storage; restricted modification/access; redact secrets and sensitive unnecessary payloads. |
| Analytics | Bounded event ingestion and aggregates | No synchronous storefront dependency; minimization, retention, deduplication and shop-scoped dashboards. |

Use database constraints as well as application validation. In particular, a product referencing a department or media record must not cross shop boundaries even if both IDs exist. If row-level security is adopted as defense in depth, document connection-pool/session scoping and test privileged bypasses; it does not replace application authorization.

### Contracts to establish before consumers depend on them

- **Actor/authorization:** actor ID, trusted memberships, requested permission, resource owner, and explicit denial behavior. Never accept a browser's claimed role/shop ownership.
- **Public eligibility:** one canonical policy used by direct routes, search, feeds, contact/enquiry endpoints, previews where appropriate, and cache generation. Return a platform-owned unavailable/closed state with no restricted content.
- **LSS validation:** structural → semantic → reference/ownership → component-version → policy → accessibility/performance checks. Validate again against current state at publication.
- **Mutation:** authorize → validate/concurrency check → transaction → audit and durable event → commit → retryable projections. Failed writes must not appear successful.
- **Jobs:** event/job ID, shop ID, entity ID, entity version, deduplication key, attempt/timeout policy and observable terminal outcome. Worker privileges are scoped to the task.
- **Search:** query/scope/category/locale/cursor/page size in; bounded shop results with matching context out; explicit empty, invalid, and unavailable responses.
- **AI:** authorized input context and permitted operations in; untrusted structured intent/patch plus usage metadata out. No provider can publish or execute code.
- **Storage/notification/payment adapters:** production adapters and clearly labeled local fakes implement the same contract; unavailable capability is visible.

### State and cache precedence

Write a complete transition table with actor, prerequisites, from/to states, idempotency key, side effects and audit reason. Cover ordinary and exception paths, including resubmission, revocation, archival, payment reversal and manual correction.

Compute public eligibility from all necessary conditions rather than copying a boolean into unrelated tables. An approved/published design does not override arrears closure or moderation suspension. A renewal may remove an arrears closure while leaving suspension intact. Grace-period visibility must follow D08 explicitly.

Private responses and previews must use appropriate no-store behavior and authenticated access. Public cache keys include shop, content revision/version, locale and every other correctness-relevant dimension. Resolve tenant context explicitly in queries and cache keys. Restrict status-sensitive full-page CDN caching until the revocation design is proven; a page cached without an eligibility check is a security risk.

## 5. Execution sequence

Each numbered task below is an independently reviewable change or small group of changes. A phase gate closes only with recorded evidence. Tests belong with the implementation that introduces the behavior, not in one cleanup phase at the end.

The main dependency chain is:

```text
P0 decisions → P1 foundation → P2 data → P3 identity/isolation → P4 durable jobs
  → P5 catalogue/media → P6 LSS + public prototype → P7 discovery
  → P8 merchant/operator/rent lifecycle → P9 trust + analytics
  → P10 conversational design → P11 full validation → P12 release preparation
  → P13 controlled pilot and evidence-led growth
```

P5–P7 collectively close the architecture-prototype gate. Small UI research, policy writing, provider evaluation and runbook drafts can proceed alongside prerequisites, but consumers must not assume an unproven contract is complete. A team can divide work at those boundaries; one implementer can execute the same order. Do not promise dates before measuring progress through the prototype.

### P0 — Reconcile specifications and make the backlog executable

**Depends on:** repository review. **Produces:** an agreed scope and decision baseline.

- [x] P0.1 Inspect Git state and preserve existing work. Use the task's safe implementation branch or create an ordinary dedicated branch when implementation begins. Use the existing isolated checkout; do not create a worktree unless requested.
- [x] P0.2 Create the Next.js/Node/TypeScript ADR; mark ADR-0001 superseded without erasing it. Align README, architecture, stack comparison, technical specification and decision register around current decisions versus remaining hypotheses.
- [ ] P0.3 Turn I01–I15 and the source-coverage matrix into backlog acceptance criteria. Define prototype, pilot and complete-build deliverables distinctly.
- [ ] P0.4 Resolve immediately blocking decisions; assign owners/due phases to the rest. Define the four state machines, their interaction, and the role/action matrix before schema hardening.
- [ ] P0.5 Sketch the five critical flows: application/payment/provisioning; catalogue/design/publication; search-to-shop/contact; renewal/closure/reopening; report/suspension/appeal. Include empty/loading/error/conflict states and mobile behavior.
- [ ] P0.6 Threat-model tenant boundaries, sessions, privileged operations, public caching, uploads, AI context, payments and account recovery. Record assets, abuse cases and controls.

**Gate:** no unresolved stack conflict; each core requirement has a phase/test owner; unknown policy is visible. No production behavior is built around an unrecorded financial or destructive-data assumption.

**Containment:** documentation-only changes are easy to review/revert; preserve original decision history.

### P1 — Reproducible application foundation and continuous checks

**Depends on:** P0/D01–D03/D12 direction. **Produces:** a runnable web/worker/database development base.

- [ ] P1.1 Pin compatible Node, Next.js, TypeScript, PostgreSQL and package-manager versions. Create a single lockfile, strict type checking, linting, formatting and server/client import boundaries. **High stage:** web/runtime/tooling complete; PostgreSQL pin/integration awaits X1.
- [ ] P1.2 Scaffold the four route surfaces with shared accessible UI primitives. Show explicit loading, denied, unavailable and not-found states. Keep the public shell light. **High stage:** public routes, error/not-found/loading components and unavailable private gateways complete; authenticated denial flows await X1.
- [ ] P1.3 Add typed server configuration and `.env.example` containing names and unmistakable placeholders only. Classify required core values versus optional capabilities; reject insecure production defaults.
- [ ] P1.4 Add reproducible local PostgreSQL and, when selected, object-storage/job dependencies. Container definitions must preserve normal TLS, signatures and checksums; follow cloud proxy/CA guidance when used in this environment.
- [ ] P1.5 Define scripts for development, worker startup, build/start, type checking, tests, migrations, seed and benchmark. Document working directories and readiness checks. Ensure builds do not unexpectedly contact production services.
- [ ] P1.6 Set up test runners for domain tests, real-PostgreSQL integration tests and browser flows. Use isolated test databases; do not substitute SQLite for PostgreSQL-specific correctness.
- [ ] P1.7 Establish CI for frozen installation, lint/types, tests, migrations and production build. Start secret/dependency scanning; triage findings rather than blanket-disabling checks.
- [ ] P1.8 Add structured redacted logging, request/correlation IDs, liveness and meaningful readiness. Separate optional-provider failures from core service readiness.

**Gate:** a clean checkout can install, migrate, start, serve a representative request, run the initial tests and build using documented commands. A second setup does not corrupt persistent state. No client bundle or build log contains a server secret.

**Containment:** no real merchant data or credentials; generated data and caches are ignored, not committed.

### P2 — Canonical data, constraints and deterministic fixtures

**Depends on:** P1 plus state/role/catalogue decisions. **Produces:** a migration-controlled domain model.

- [ ] P2.1 Implement the domain tables from section 4 with foreign keys, unique constraints, tenant-consistent references, indexes, timestamps and explicit version columns where concurrent editing matters.
- [ ] P2.2 Separate application, merchant, shop, publication, tenancy, rent and moderation records. Permit pre-provisioning invoices; distinguish immutable internal IDs from editable names/slugs.
- [ ] P2.3 Define currency precision, locale/time handling and rent period boundaries. Store financial events with source/reference/actor and non-destructive adjustment semantics.
- [ ] P2.4 Create append-oriented audit and durable-event/outbox tables. Transactions that change sensitive state must record their audit/event consistently.
- [ ] P2.5 Build a safe development seed: multiple merchants/malls, Annette Fashion House, Dresses/Shoes/Handbags/New Arrivals, staff/operator roles, and unpublished/active/grace/closed/suspended fixtures. Supply development sign-in through an explicit local procedure; never create a deployed default administrator password.
- [ ] P2.6 Create a repeatable synthetic generator with size/seed parameters and realistic distributions, including hot shops, skewed catalogue sizes and duplicate-like content. Target 1,500 shops and about 150,000 products without committing generated records.
- [ ] P2.7 Protect seed/reset tools with an explicit nonproduction database guard; never truncate an unknown database. Make repeat invocation documented and safe.
- [ ] P2.8 Test migrations on an empty DB and an older fixture schema, integrity constraints, concurrent unique-ID allocation and tenant-invalid references.

**Gate:** database constraints reject invalid relationships; fresh and upgrade migrations work; fixtures are reproducible and isolated from production.

**Containment:** use expand/backfill/contract migration discipline from the start. No destructive migration is justified merely to simplify an ORM change.

### P3 — Authentication, authorization and tenant isolation

**Depends on:** P2. **Produces:** the security boundary all private functionality will use.

- [ ] P3.1 Implement login/logout, session expiry/revocation, recovery, verification where required and secure cookies. Prevent account enumeration; rate-limit sensitive endpoints and define CSRF/origin defenses for cookie-authenticated mutations.
- [ ] P3.2 Implement scoped merchant memberships/roles and separate operator permissions. Verify permissions in server actions, handlers and domain services; check resource ownership independently of request IDs.
- [ ] P3.3 Deliver working Landlord MFA enrollment, challenge, recovery and enforcement, plus Shopkeeper MFA and risk-policy hooks. High-risk changes require fresh authentication. Architecture placeholders are insufficient for live operator access.
- [ ] P3.4 Protect invitations, role changes, ownership transfer and removal of the last owner. Invalidate access when membership/session state changes; audit it.
- [ ] P3.5 Create reusable Merchant A/B attack fixtures and a permission test harness. Exercise private reads, writes, nested references, bulk operations, search-like private APIs, uploads, previews and exports as they are introduced.
- [ ] P3.6 Ensure private data cannot escape via public RSC payloads, cache reuse, errors, static generation or logs. Public customer flows remain usable without authentication.

**Gate:** the complete initial role matrix passes positive and negative tests; guessed IDs and stale/revoked sessions do not grant access; actual MFA protects Landlord routes and actions.

**Containment:** deny by default. A UI-hidden control never substitutes for a server-side denial.

### P4 — Durable background work and event consistency

**Depends on:** P2/P3. **Produces:** a reliable substrate for media, search, rent, notifications and analytics.

- [ ] P4.1 Implement selected queue/worker/scheduler adapters and independent process entry points. Use transactional enqueue when it shares the DB transaction, or an outbox dispatcher when it does not.
- [ ] P4.2 Specify at-least-once delivery semantics. Use deduplication/unique constraints, bounded retries/backoff, timeouts, leases/heartbeat where needed, and observable failed/dead-letter jobs. Do not assume exactly-once execution.
- [ ] P4.3 Handle delayed and out-of-order events using entity versions or current canonical state. Older media/index events must not resurrect deleted or unpublished content.
- [ ] P4.4 Implement safe administrative retry/replay and backpressure. Limit per-shop work so one tenant cannot exhaust all processing capacity.
- [ ] P4.5 Add notification and storage interfaces with local sinks/fakes. Real delivery side effects occur after durable commit and use provider idempotency where available.
- [ ] P4.6 Test a crash after DB commit but before dispatch, after delivery but before acknowledgment, and during processing. Demonstrate recovery without duplicated financial/tenancy effects.

**Gate:** web and worker restart independently; queued work survives restart; retries converge to correct state; a worker outage produces visible pending state rather than silent loss.

**Containment:** job schemas are versioned; new deployments can drain/read older jobs; poison jobs cannot block unrelated tenants indefinitely.

### P5 — Catalogue, contact settings and the media pipeline

**Depends on:** P3/P4 and catalogue decisions. **Produces:** real, safe shop content.

- [ ] P5.1 Implement shop profiles, departments and product/service create/read/update/archive, ordering, availability, price rules and approved contact/commerce configuration. Add version/conflict handling for edits that must not silently overwrite newer values.
- [ ] P5.2 Support Call, WhatsApp and a bounded guest enquiry/request/reservation flow, plus structured delivery/pickup and merchant payment instructions. Validate phone/URL schemes and prevent unsafe external navigation. An enquiry acknowledgment is not a confirmed order, payment or inventory reservation unless separately implemented.
- [ ] P5.3 Require step-up authentication and audit history for sensitive contact/payment changes; provide operator investigation/recovery and policy-controlled notifications.
- [ ] P5.4 Implement owned upload sessions, quarantine, byte/type/signature/dimension/pixel limits, metadata removal and secure decoding. Cover decompression bombs, malformed/polyglot files, unsafe SVG, and arbitrary remote-fetch/SSRF exposure. Explicitly restrict supported formats.
- [ ] P5.5 Process media asynchronously into thumbnail, search-card, display and retained rebuild-source variants. Select formats/dimensions with quality tests. Keep unsafe originals private; only publish approved ready variants.
- [ ] P5.6 Enforce concurrent upload/storage quotas, retry visible failures, cleanup abandoned uploads and reference-aware deletion. Ensure preview/draft media is not exposed accidentally through a public bucket or guessable URL.
- [ ] P5.7 Show usable merchant processing/error states and public placeholders. Add accessible alt-text workflow, aspect ratios, responsive images and lazy loading.
- [ ] P5.8 Test tenant reference attacks, guest-enquiry abuse/rate limits, sensitive-change authorization, concurrent edits/uploads, duplicate processing, provider failure and deletion while a media job is pending.

**Gate:** a merchant can maintain a real catalogue and approved contacts; an oversized phone image becomes optimized variants without blocking browsing; private/unsafe media stays inaccessible; enquiries route to the correct shop without a customer login.

**Containment:** old ready media remains usable during replacement processing; a failed upload does not remove the last working image. Archive content before irreversible cleanup according to policy.

### P6 — Safe LSS, revisions and a public shop vertical slice

**Depends on:** P3–P5. **Produces:** the first coherent merchant-to-customer rendering path.

- [ ] P6.1 Turn the illustrative schema into a versioned runtime contract with matching TypeScript types and component-specific discriminated properties. Close unrestricted fields deliberately. Constrain themes, URLs, rich text, SEO and extensions; reject unsupported schema/component versions.
- [ ] P6.2 Add semantic validation: unique space IDs, valid navigation destinations, tenant-owned eligible references, required per-component properties, bounded queries and total complexity limits. Fifty spaces each containing thirty components is not automatically an acceptable page budget.
- [ ] P6.3 Implement the approved component registry with prop schemas, versions, data requirements, mobile layout, accessibility, loading behavior and empty/error fallbacks. Start with the prototype subset, then complete the in-scope registry before the full build gate.
- [ ] P6.4 Implement draft save, private preview, immutable revisions, atomic publication and rollback as a new revision. Require a base revision; return a meaningful conflict for stale edits. Recheck current permissions/references/eligibility at commit.
- [ ] P6.5 Render from validated stored LSS and canonical data. Batch reference resolution to avoid N+1 queries. Design rollback must not restore stale prices, stock, payment details or revoked contact methods.
- [ ] P6.6 Build Annette's public shop with Dresses, Shoes, Handbags, New Arrivals and WhatsApp, including stable shop/deep links and safe slug redirects. Handle removed products/departments with a useful shop-level fallback.
- [ ] P6.7 Enforce platform-owned navigation, report controls, verification display and closure/suspension UI. Unknown components or missing objects must have safe fallback behavior, while new invalid publications are rejected.
- [ ] P6.8 Implement targeted cache invalidation/versioning and status checks. Distinguish ordinary content freshness from urgent visibility revocation. Test Next.js caches, client router refresh and any CDN behavior actually used.
- [ ] P6.9 Add deterministic layout patches for “move shoes before handbags,” theme changes and action visibility. Show a preview/change summary; manual/template controls work without AI.
- [ ] P6.10 Test hostile props/markup/URLs, forged verification badges, cross-shop references, missing media/products, concurrent publication, rollback, old-schema rendering and closed-shop overrides. Check keyboard, focus, screen-reader semantics, touch targets and reduced motion.

**Gate:** the P6 prototype renders usable mobile HTML without customer login; current catalogue values appear; invalid design cannot publish; stale editors cannot overwrite newer work; design rollback is auditable; public rendering makes no AI calls.

**Containment:** preserve prior validated revisions and renderer compatibility. If a new renderer fails, select the prior compatible deployment/revision without reverting financial or catalogue data.

### P7 — Mall discovery, search and the architecture benchmark

**Depends on:** P6 plus durable projection support from P4. **Produces:** the core digital-mall discovery experience.

- [ ] P7.1 Build the public entrance/category directory with bounded content, consistent merchant identity and search-to-shop navigation. Keep internal mall IDs and tenancy tiers out of customer presentation.
- [ ] P7.2 Implement PostgreSQL search behind `SearchService`, with global/category/shop-local scopes, indexed normalized fields, safe parameterized queries and public-only projection data.
- [ ] P7.3 Aggregate matches into shop results with useful matching product/department context, configurable initial page size near 20, deterministic tie-breaking and validated cursors. Bound query length, filter combinations and page size.
- [ ] P7.4 Enforce eligibility before ranking/pagination as far as the canonical design permits. Recheck stale projections against current status before disclosure; exclude unpublished/private products. Do not use `mall_id` as an organic rank signal.
- [ ] P7.5 Add diversity/spam controls, baseline new-shop exposure and a small judged query set covering common terms, zero results, categories, spelling variants and agreed pilot language needs. Record limitations honestly rather than claiming advanced multilingual search.
- [ ] P7.6 Test live catalogue updates, unpublish, removal, closure and reopening through projection/cache paths. Provide safe projection rebuild and event replay without downtime or lost updates.
- [ ] P7.7 Make search failure explicit while direct shops/category fallback continue where core infrastructure is healthy. Because initial search shares PostgreSQL, do not claim it survives a total DB outage; apply query timeouts and resource limits to reduce shared failure impact.
- [ ] P7.8 Run the vertical prototype on approximately 1,500 shops/~150,000 products with real PostgreSQL. Exercise all six slices from `VERTICAL-PROTOTYPE.md`: render, discovery/deep link, update, tenant attack, async image processing, and revision-checked design patch.
- [ ] P7.9 Capture query plans, latency/throughput, HTML/JS/media transfer, memory/CPU, query counts, freshness, cache behavior and job lag. Compare against predeclared provisional budgets; fix measured bottlenecks before adding broad product scope.

**Architecture gate:** all six slices have passing functional/security evidence and a reproducible benchmark report. A scale claim is permitted only for the actual data volume, hardware and load tested. Record hardware limits and unfinished measurements explicitly.

**Containment:** projections are rebuildable; keep old projection/read paths available through a versioned migration. No unbounded full-table fallback in a public request.

### P8 — Complete Shopkeeper, Landlord and tenancy/rent workflows

**Depends on:** P7 and D04/D07/D08 policy decisions. **Produces:** the end-to-end merchant lifecycle.

- [ ] P8.1 Implement merchant applications, completeness/duplicate signals, verification evidence upload/access and review queues. Support reviewing, needs-information/resubmission, approval and rejection with reasons and audit.
- [ ] P8.2 Issue the first obligation/reference against the approved application/account. Build verified manual reconciliation first if selected, and provider adapters/webhooks when a collection provider is selected. Never activate from a browser success page or merchant-uploaded payment claim alone.
- [ ] P8.3 Make verified payment/approved waiver → tenancy activation → immutable shop ID/mall assignment → membership/provisioning atomic or durably recoverable and idempotent. Test retries and concurrent activation/capacity allocation.
- [ ] P8.4 Add invoices, payments, allocations, corrections/reversals and reconciliation queues under the chosen accounting policy. Validate callback signatures, amount/currency/reference, replay protection and duplicate/out-of-order events. Suspicious mismatches go to review.
- [ ] P8.5 Implement scheduled due notices, reminders, grace, arrears closure and verified reopening. Use a controllable clock and idempotent jobs. A late/retried job must re-read current payment/state so it cannot close a just-renewed shop.
- [ ] P8.6 Preserve moderation suspension across renewal. Add audited overrides/arrangements where policy permits; money movement/history is never silently rewritten to match a UI state.
- [ ] P8.7 Finish merchant onboarding guidance, profile/catalogue/media/design/contact controls, publication, rent/status, account security and understandable pending/conflict/error states. Show progress without requiring technical vocabulary.
- [ ] P8.8 Finish Landlord MFA-protected applications, verification, provisioning, mall occupancy/capacity warnings, rent exceptions, close/reopen and audit workflows. Add explicit reason, step-up and bounded batches for high-impact actions.
- [ ] P8.9 Handle multi-shop merchants, staff permissions, slug change and mall reassignment. Provision another logical mall at a configured planning threshold rather than hard-failing shop 1,501.
- [ ] P8.10 Execute a browser/API acceptance journey from application to publication, search/contact, renewal, arrears closure and reopening. Include duplicate first payment, interrupted provisioning, payment reversal, wrong amount/reference, overdue reminders and suspension during renewal.

**Gate:** the entire lifecycle works without manual database edits; financial events reconcile; double delivery cannot double-provision or double-credit; closure hides the shop while retaining recoverable data; eligible renewal restores service.

**Containment:** corrections are new events; operator actions remain auditable; production automatic closure stays disabled until policy and replay/time-boundary tests pass. Provider fakes remain labeled and are forbidden as silent production substitutes.

### P9 — Trust, customer safety, analytics and operational usefulness

**Depends on:** P8. **Produces:** a trustworthy and measurable pilot product.

- [ ] P9.1 Implement public reporting, abuse protection, scoped moderation cases, investigation, suspension, appeal/review and reasoned reinstatement. Verify report attachments and identity evidence remain private.
- [ ] P9.2 Keep verification badges platform-controlled and truthful about what was verified. Present merchant commerce responsibilities accurately and make safety/report controls accessible.
- [ ] P9.3 Implement prioritized operator queues for security, fraud, account recovery, payment exceptions, verification, moderation and support. Define escalation, response ownership and safe overrides.
- [ ] P9.4 Implement account recovery and contact/payment-change incident procedures, with session revocation and audit. Do not let ordinary support access bypass sensitive-change controls.
- [ ] P9.5 Instrument the eleven pilot events: `mall_visit`, `search_submitted`, `search_results_viewed`, `shop_result_clicked`, `shop_viewed`, `department_viewed`, `product_viewed`, `contact_action_clicked`, `direct_link_entry`, `merchant_publish`, `merchant_catalogue_update`.
- [ ] P9.6 Separate direct-link versus mall-discovery attribution, deduplicate retries, filter known bot/internal traffic where practical, and bound anonymous identifiers/retention. Avoid unnecessary personal data or sensitive raw query/prompt capture.
- [ ] P9.7 Give merchants only their authorized aggregates. Give operators activation/time-to-publish, usage, search quality, renewal, support burden, fraud/backlogs and resource-cost views. A contact click measures intent, not a verified completed sale.
- [ ] P9.8 Add privacy-aware export and governed deletion/retention workflows, including verification/enquiry records, legal retention and backups. Do not couple deletion to arrears closure.
- [ ] P9.9 Record per-shop media/storage/bandwidth, AI/job use, support/verification time and rent collection costs where measurable. Document gaps in cost attribution and avoid false precision.

**Gate:** operators can investigate and reverse appropriate mistakes without erasing history; tenant dashboards do not leak; analytics can fail without failing storefront requests; pilot metrics distinguish direct traffic, discovery and actual paid renewal.

**Containment:** feature flags permit disabling analytics/automation without disabling commerce. High-impact moderation remains subject to authorized review and a recovery path.

### P10 — Provider-neutral conversational design

**Depends on:** validated LSS and permissions from P3/P6; usage accounting and operations from P9. **Produces:** the AI workflow required by `prompt.txt`.

- [ ] P10.1 Define `AIProvider`, `GeminiProvider`, `OpenAIProvider` and `LondosDesignOrchestrator` contracts. Planner/designer/merchandising/inspector are logical roles, not a requirement for four model calls.
- [ ] P10.2 Implement a deterministic path for supported simple edits. Ambiguous natural language uses the configured initial provider; schema-constrained output is treated as untrusted data.
- [ ] P10.3 Assemble only minimal authorized shop context after checking access. Delimit merchant/catalogue text as data; exclude secrets, unrelated shops, private evidence and unrestricted tools. Recheck authorization before saving or applying a proposal.
- [ ] P10.4 Compile approved structured intent into bounded patches. Run the complete deterministic validator before preview and again at publication. Detect stale base revisions and changes in referenced resources.
- [ ] P10.5 Use Gemini initially when configured. Use OpenAI selectively for complex/ambiguous redesign, low confidence, repeated bounded repair, explicit quality review or allowed fallback. Revalidate reviewer recommendations identically.
- [ ] P10.6 Add timeout, bounded context/request/repair sizes, backoff, cancellation, per-shop/concurrency/cost limits and usage accounting. Obey provider retry/rate-limit signals. Credential failover must not cycle through free keys to evade quota or billing.
- [ ] P10.7 Store credentials only server-side through the actual deployment secret facility. Validate configuration without printing values. Support the named credential pool in `prompt.txt` where allowed; if a cloud platform reserves a requested variable name, use a supported binding/name mapping rather than embedding secrets or weakening controls.
- [ ] P10.8 Show understandable unavailable/quota/conflict/review states. Templates, manual editing and existing published shops remain usable. AI cannot publish; merchant confirmation is a separate authorized action.
- [ ] P10.9 Test malformed/oversized JSON, unknown operations, script/SQL/JS-like payloads, hostile descriptions, cross-shop IDs, stale permissions, provider timeout/outage/rate-limit, reviewer disagreement and failed repair. Assert a simple deterministic edit has no paid-review call and public rendering has zero provider calls.
- [ ] P10.10 Add redacted provider/model/outcome/latency/token/cost metadata and limited prompt retention policy. Scan browser output, logs, analytics and error responses for credential leakage using safe test sentinels.
- [ ] P10.11 Run live provider contract checks with authorized configured accounts when available. Keep fake-provider contract tests deterministic in CI. Record unavailable providers as external validation gaps; never claim a fake proves live access or model quality.

**Gate:** ordinary merchant language can reach a validated, previewed, explicitly published revision; malicious/provider failures remain within the design boundary; real-provider status is documented separately.

**Containment:** disable a provider or the entire AI feature without a deployment-wide outage; retain manual design and prior published revisions. No arbitrary code generation/execution path is introduced.

### P11 — Full-system validation, compatibility and performance hardening

**Depends on:** P0–P10. **Produces:** evidence for the complete build and release candidate.

- [ ] P11.1 Run the acceptance/security matrix in section 8 against a production build and real PostgreSQL/object-storage/worker integrations where configured. Retain exact commit, commands, counts, outcomes and current artifacts.
- [ ] P11.2 Repeat the P7 scale workload after the full feature set exists. Include realistic images, status mixes, hot-shop traffic, cold/warm caches, concurrent public requests and merchant updates. Identify p50/p95/p99, errors and saturation rather than reporting only averages.
- [ ] P11.3 Verify query/payload budgets, pagination stability, projection lag, urgent eligibility changes and targeted invalidation. Test the actual multi-process/cache topology intended for deployment; one process passing is insufficient evidence for multiple replicas.
- [ ] P11.4 Exercise outages separately: AI, analytics, worker, media storage, cache, search operation and DB writes. Test recovery and reconciliation after service returns, not only the initial error page.
- [ ] P11.5 Review authorization, CSRF/XSS, upload/SSRF boundaries, rate limits, session/MFA recovery, secret handling and dependencies. Resolve exploitable high-impact findings before pilot; assign explicit ownership to any accepted lower-risk issue.
- [ ] P11.6 Check mobile browsers and agreed low-end-device/network profiles. Combine automated accessibility checks with manual keyboard/focus/screen-reader tasks; validate rendered shop templates, not only the shared UI library.
- [ ] P11.7 Replay representative old LSS/component versions, old queued jobs and previous DB fixtures through the upgraded application. Test migration from the previous release, interrupted backfills and idempotent retries.
- [ ] P11.8 Finish setup, operator, merchant, API/domain, configuration and failure documentation. Ensure documented commands work from a clean environment and that no claimed capability is still a nonfunctional placeholder.

**Gate:** no unexplained required-test failures or untested critical flows; accepted limitations and missing external validations are explicitly recorded. Failed tenant isolation, rent integrity, secret handling, unsafe rendering or unrecoverable migration blocks release.

**Containment:** optimization must preserve behavior; compare to the established baseline and rerun the affected regression group. Do not weaken tests or budgets after seeing a failure merely to pass.

### P12 — Deployment preparation and operational recovery

**Depends on:** P11 and production policy/provider decisions. **Produces:** a reviewable release candidate, not an automatically authorized production deployment.

- [ ] P12.1 Prepare reproducible production web/worker artifacts, infrastructure/configuration definitions, migrations and provider/domain/TLS setup instructions. Separate development, staging and production data/credentials.
- [ ] P12.2 Configure supported production process management, connection pooling, health/readiness checks, graceful shutdown, scheduler ownership, capacity limits and least-privilege credentials. Verify proxy/CDN cache semantics and private response protection.
- [ ] P12.3 Add monitoring/alerts for latency/errors, DB saturation, worker oldest-job age, projection lag, failed media, stale backups, rent exceptions, auth abuse and storage/bandwidth/AI cost. Assign an alert recipient and action/runbook; define useful thresholds with observed baselines.
- [ ] P12.4 Set RPO/RTO by data class. Configure encrypted DB backups, protected/versioned media, retained rebuild sources, an independent encrypted recovery copy, key recovery and backup-age/failure alerts.
- [ ] P12.5 Restore DB and media into an isolated environment; validate tenant access, rent totals/events, LSS history, attachments, reference integrity and media availability. Rebuild search/caches and replay safe pending jobs without duplicate notifications/payments. Measure actual recovery time and data gap.
- [ ] P12.6 Rehearse application rollback and forward-fix with schema/job compatibility. Test feature shutdown for AI, public publication, automated closure or provider callbacks when appropriate; do not replace durable business history with a backup just to roll back code.
- [ ] P12.7 Write and rehearse runbooks for DB outage/corruption; secret compromise; Landlord/merchant takeover; malicious upload; payment reconciliation; storage/CDN outage; accidental bulk deletion; privacy breach; DNS/domain compromise; backup restoration.
- [ ] P12.8 Assemble the release dossier: exact source commit, image/artifact identity, test/benchmark/security reports, decisions, known limitations, migration sequence, rollback plan, external capability status, operational ownership and remaining launch prerequisites.
- [ ] P12.9 Obtain owner authorization and required credentials before production deployment, as required by `prompt.txt`. Until then, finish all authorized build and rehearsal work and report the exact remaining action. Never claim deployment, publication or live integration that did not occur.

**Gate:** a tested release candidate and recovery procedure exist; production-critical external requirements are satisfied before launch. Staging verification is recorded as staging verification.

**Containment:** use a limited rollout, observable checkpoints and stop conditions. Keep the previous compatible application artifact; retain expanded schema until rollback compatibility no longer requires it.

### P13 — Controlled pilot, business validation and later scope

**Depends on:** authorized launch of a P12 release candidate. **Produces:** evidence to go, revise or stop.

- [ ] P13.1 Recruit 10–20 merchants across manageable categories. Record existing discovery channels/catalogue/contact methods, pain points and willingness-to-pay before onboarding.
- [ ] P13.2 Observe application, setup, catalogue, design, publication and sharing without doing every task for merchants. Record assistance and verification minutes accurately.
- [ ] P13.3 Track direct versus discovery routes, search-to-shop/contact, cross-department browsing, catalogue maintenance, trust incidents and repeat engagement under the privacy policy.
- [ ] P13.4 Observe at least one actual renewal opportunity; distinguish stated intent from paid renewal. Measure collected revenue, fees, support/moderation, storage/bandwidth, search/media/AI and acquisition costs.
- [ ] P13.5 Set numeric cohort success/revise/stop thresholds before reviewing outcomes. Produce the decision report required by `PILOT-EXPERIMENT.md`, including limitations of a small sample.
- [ ] P13.6 Improve the bottleneck supported by evidence: onboarding, relevance, merchant trust, support automation, resource allowances or rent. Do not scale acquisition into negative contribution margin without an explicit revised business hypothesis.
- [ ] P13.7 Expand infrastructure only after measured need: indexes and bounded queries first; cache/queue tuning and capacity next; dedicated search/read replicas/partitioning later. Preserve stable public shop identity across migrations.

**Gate:** pilot findings justify the next investment. A functioning application does not prove that the digital-mall business model is viable.

**Deferred backlog, retained explicitly:** designer marketplace/full SDK; 3D/360/video showroom expansion; custom domains; advanced CRM/messaging; reviews/loyalty/recommendations; native apps; sponsored discovery; integrated checkout/custody; multi-region/sharding/microservices. Each needs its own product/economic/security decision. Sponsored promotion must remain labeled and separate from organic rank. None may silently displace a required capability in the present build.

## 6. Milestone gates and progress tracking

| Gate | Required evidence | Stop conditions |
|---|---|---|
| G0: specification baseline, after P0 | Reconciled stack, explicit scope, state/role contracts and decision register. | Conflicting architectural direction or unowned critical decisions. |
| G1: secure foundation, after P4 | Reproducible setup, migrations, real auth/MFA, tenant tests and crash-safe jobs. | Cross-tenant access, insecure privileged defaults, lost durable work. |
| G2: architecture prototype, after P7 | Six vertical slices, Annette journey, representative dataset and reproducible measurements. | Unbounded queries/media, stale unsafe visibility, broken revision or tenant boundaries. |
| G3: coherent merchant lifecycle, after P9 | Application through renewal; rent reconciliation; trust operations; useful pilot instrumentation. | Double activation/credit, unauthorized state changes, missing operator recovery. |
| G4: requested build, after P10/P11 | Safe conversational design plus full regression/compatibility evidence and explicit external capability status. | Required functionality still placeholder-only, unexplained critical failures, misleading integration claims. |
| G5: launch candidate, after P12 | Production build, migration/recovery rehearsal, runbooks, launch policies and release dossier. | Unproven backup restore, missing production-critical capability, unmitigated critical security defect. |
| G6: pilot learning, after P13 | Cohort funnel, paid renewal, costs, trust/support burden and go/revise/stop decision. | Growth assumptions unsupported by evidence. |

Use the following status vocabulary for tasks: `not started`, `in progress`, `blocked`, `implemented`, `verified`, `released`, or `explicitly deferred`. “Implemented” is not equivalent to “verified.” Record the issue/PR, owner, dependencies, evidence path and next action. A blocked integration leaves that task open while independent tasks continue.

An execution log entry should contain:

```text
Task / requirement IDs:
Owner and status:
Source commit and environment:
Change and contracts affected:
Commands/checks actually run:
Pass/fail/skip counts and evidence:
Outstanding decisions or external dependencies:
Migration / rollback or recovery notes:
Next task:
```

Do not estimate the whole build from scaffold speed. After G2, estimate remaining work using the observed effort for a completed vertical slice, including tests, UI/error states, integration and documentation. Add separate capacity for external-provider onboarding and production policy work. Re-estimate when scope changes.

## 7. How to change the system without repeatedly breaking it

### For every implementation PR

1. Select a small end-to-end behavior and cite its phase/invariant IDs. Describe the user-visible outcome and the failure cases the change must handle.
2. Inspect the current checkout and related contracts/tests. Preserve unrelated work; do not reset the repository to make a change easier.
3. Identify affected consumers: routes/actions, worker jobs, migrations, LSS versions, caches, search, provider adapters, analytics and documentation.
4. Write or extend behavior tests alongside the change. For a bug, add a regression reproducer. Include negative authorization tests whenever a new protected entry point appears.
5. Keep public interfaces backward compatible where possible; expose incomplete features behind explicit flags. An off flag must not leave a publicly callable unprotected endpoint.
6. Run focused checks, then the required CI suite and production build as applicable. Check the runner actually executed the intended tests and preserve exit status; never relabel skipped or zero-test runs as passes.
7. Review accessibility, data/JS/media growth, logging, secrets and user-visible failure behavior. Audit dependency changes and migration effects.
8. Record migrations/rollout/recovery instructions, actual validation and remaining limitations. Merge only when required checks pass or a clearly nonblocking exception is documented by its owner.

Keep commits coherent. Do not put generated synthetic data, credentials, real identity evidence, local databases or build caches into Git. Tests should assert externally meaningful behavior/invariants rather than duplicate implementation details. Documentation-only changes need link/consistency review rather than an unnecessary full application benchmark.

### Database migration discipline

- **Expand:** add nullable/new fields, tables or compatible indexes first. Evaluate locks, table size and transaction limits on representative PostgreSQL data.
- **Deploy compatible readers/writers:** old and new releases must coexist during rollout when that topology is used. Avoid indefinite dual writes without a reconciliation plan.
- **Backfill:** use bounded, resumable, idempotent batches; monitor progress and invariants; never execute a long migration in a customer request.
- **Validate:** compare counts, referential/tenant integrity and financial totals; test failures/interruption and retry.
- **Switch:** change reads under a controlled rollout after validation; retain rollback-compatible schema.
- **Contract later:** remove old structures only after compatibility windows, backup verification and explicit review of destructive consequences.

Never edit a migration already applied to a shared environment. A code rollback is not permission to drop new data. Use a forward correction or compatible prior release; database restoration is an incident procedure with known data-loss/reconciliation consequences.

### LSS and component compatibility

- Keep versioned valid/invalid fixture shops and golden render/behavior cases for every supported schema/component version.
- Migrations create new revisions or explicit transformed copies, preserving history and a recoverable original.
- Validate references against current canonical data before rollback publication; an old layout must not resurrect deleted inventory or revoked contact details.
- Test large-scale migration as a dry run on representative fixtures before batch publication; use bounded batches and per-shop failure reporting.
- Unknown/retired versions need a controlled compatibility/fallback policy, never arbitrary code interpretation or a whole-shop crash.

### Events, projections and caches

- Record event versions and deduplication keys; tolerate duplicate, delayed and out-of-order delivery.
- A DB commit and durable event registration succeed together. Side-effect failure is retried visibly rather than silently losing updates.
- Cache/projection invalidation is scoped to the affected shop/resources. A closure/suspension policy must cover origin responses, CDN output, search, deep links and contact endpoints.
- Rebuild a projection from canonical data with an update-watermark/catch-up strategy, then switch safely. Rebuilding must not lose writes occurring during the rebuild.
- Test multiple web/worker processes before claiming coherent invalidation at that topology. Local in-memory cache assumptions do not generalize to replicas.

### Release stop and recovery rules

Immediately stop rollout for tenant leakage, corrupted financial state, failed migrations, secret exposure, bypassed MFA/authorization, unsafe rendering or inability to enforce suspension. For ordinary regressions, compare against predeclared error/latency/freshness thresholds rather than ad hoc judgment after deployment.

Disable the affected feature where that contains the issue; retain evidence and durable work. Deploy a compatible previous artifact or a forward fix. Reconcile pending jobs, rent/provider events and projections after recovery. Verify recovery with representative requests and affected invariants before resuming rollout. Do not indiscriminately restore yesterday's database and discard valid customer changes.

## 8. Acceptance and regression matrix

These are required behaviors to implement and verify, not tests already present in the repository. Use real PostgreSQL integration tests for transactions/constraints and a production-mode server for representative browser tests. Provider fakes cover deterministic failure cases; selected live contract tests cover actual integration capability.

| ID | Scenario and required assertions | First phase / repeat gate |
|---|---|---|
| T01 | Anonymous customer reaches entrance → search → Annette's shoes → another department → enabled contact/enquiry; no login wall. | P6/P7; G3/G4/G5 |
| T02 | Merchant A attempts B's private read/write, nested department/media reference, bulk edit, preview, export and job/AI target; every unauthorized path denies without leaking private content. | P3 onward; every affected PR |
| T03 | Staff permissions, removed membership, expired/revoked sessions, forged role/shop IDs, login recovery and CSRF/origin checks behave correctly. | P3; G4/G5 |
| T04 | Landlord MFA challenge/enrollment/recovery cannot be bypassed through a direct action/API; sensitive changes need recent step-up and create audit. | P3/P8; G4/G5 |
| T05 | Concurrent application/payment activation produces one entitlement/shop identity; approval/provisioning failure retries safely. | P8; G4/G5 |
| T06 | Duplicate, delayed, replayed, wrong-reference/amount/currency and reversed rent events reconcile under policy; no double credit, fabricated payment or erased history. | P8; G4/G5 |
| T07 | Due/grace/closure/reopening at exact clock boundaries; missed/repeated jobs and payment racing closure converge correctly. Renewal does not lift moderation suspension. | P8; G4/G5 |
| T08 | Closed/suspended/unpublished resources disappear from search and restricted direct responses within agreed rules across origin/CDN/cache. A removed product cannot reappear through an old projection job. | P6/P7/P8; G4/G5 |
| T09 | Immutable identity survives rename/slug collision/alias change and mall reassignment; deep links are safe; configured capacity triggers another mall rather than a hard 1,500-shop ceiling. | P2/P7/P8; G4 |
| T10 | LSS rejects hostile/unknown props, unsupported versions, cross-shop references, duplicate IDs, excessive aggregate complexity and unsafe URLs/markup. Platform badges/status/report UI cannot be forged or removed. | P6; every registry/schema change |
| T11 | Two editors publishing from the same base produce one success and one explicit conflict; rollback is a new revision and uses current prices/contacts. Unauthorized/draft preview is inaccessible. | P6; G4/G5 |
| T12 | Missing media/product, disabled contact, empty collections and retired components have defined safe fallbacks; current templates and supported old revisions remain usable. | P6; every renderer change |
| T13 | Search is bounded, scoped, shop-first and diverse; cursors are validated; unchanged fixtures paginate without duplicates/omissions; live mutations follow a documented consistency contract. Rank does not change solely with mall ID. | P7; every search change |
| T14 | Product price/availability update is transactionally correct and meets public/search freshness targets; unrelated shop cache remains valid; rebuild catches concurrent changes. | P6/P7; G4/G5 |
| T15 | Upload abuse (type mismatch, oversized dimensions, corrupt/polyglot, decompression bomb, unsafe SVG/URL), concurrent quota use and private-object access fail safely; ready variants are appropriately sized. | P5; every media change |
| T16 | Crash at transaction/dispatch/ack boundaries, worker restart, poisoned job, duplicate/out-of-order work and scheduler overlap do not lose work or repeat consequential effects. | P4; G4/G5 |
| T17 | Sensitive contact/payment edit requires permission/step-up/audit; guest enquiries are scoped and rate-limited; requests do not falsely promise a sale/payment/reservation. | P5/P8/P9; G4 |
| T18 | Reports/verification evidence stay private; moderation appeal and reinstatement follow authorized state changes; public badge reflects authoritative verification. | P9; G4/G5 |
| T19 | AI receives only authorized minimum context; hostile merchant data cannot override tools/policy; malformed output, stale revision, revoked access and failed repair cannot publish. | P10; every orchestration change |
| T20 | AI outage/rate limit obeys policy and preserves manual design; simple supported edits avoid paid review; repeated public visits make zero AI calls; secrets never enter client output/logs. | P10; G4/G5 |
| T21 | Analytics failure does not fail browsing; merchants cannot view others' data; direct/discovery attribution and contact-intent semantics are correct; retention/export/deletion obey policy. | P9; G4/G5 |
| T22 | DB write outage reports failure, cache outage preserves privacy/correctness, media outage retains text/contacts, search/worker failure degrades explicitly, recovery drains/reconciles safely. | P4–P11; G4/G5 |
| T23 | Mobile navigation, forms/errors, focus/keyboard, screen-reader labels, contrast, reduced motion and touch targets work across all four surfaces and merchant templates. | P1 onward; G4/G5 |
| T24 | Fresh install and upgrade migration both succeed; interrupted backfill resumes; previous supported app/job/LSS versions remain compatible during rollout. | P1/P2; every relevant release |
| T25 | Encrypted restore reconstructs canonical data, tenant access, financial history and media; derived indexes rebuild; measured recovery meets approved RPO/RTO. | P12; G5 and periodic drills |
| T26 | 1,500-shop/~150,000-product mixed-load benchmark records real query plans/bytes/latencies/errors and proves bounded behavior without fetching the whole catalogue. | P7/P11; G2/G4 |

### CI and evidence tiers

| Tier | Checks | When |
|---|---|---|
| Fast feedback | Types/lint, targeted domain and permission tests, relevant contract fixtures. | During every implementation change. |
| Merge gate | Full required unit/integration suite, real DB migrations/constraints, tenant isolation, representative browser flows, production build, secret/dependency checks. | Every code PR; use explicit affected-test selection only where coverage remains sound. |
| Change-triggered | LSS compatibility, worker crash/replay, upload attack corpus, query-plan/size budgets, migration locking/backfill. | When the relevant boundary changes. |
| Release/staging | Full journeys, actual provider/storage contracts, mixed-load benchmark, failure/recovery rehearsal, mobile/accessibility and deployment smoke checks. | Before pilot release and material production changes. |
| Ongoing operations | Backup restoration, account-recovery exercises, security patches and cost/latency/freshness monitoring. | Scheduled according to risk and release policy. |

Store machine-readable results and a concise human summary under a documented evidence path, tied to commit and environment. Report passed, failed, skipped, expected-failure and unrun separately. Do not use a coverage percentage alone as proof of security or correctness. A mock-only suite cannot prove provider behavior; a passing HTTP status cannot prove the intended data was rendered.

## 9. Performance, freshness and recovery contracts

The repository intentionally leaves numerical budgets open. The numbers below are **proposed initial benchmark thresholds**, not existing requirements, measured results, uptime guarantees or a capacity promise. Ratify or revise them before the first measured run using representative devices, network conditions and an affordable deployment shape; record changes and rationale before comparing results.

### Reproducible benchmark setup

1. Record the exact source commit, dependency/runtime versions, production-mode build, database settings, CPU/RAM/storage, process count and service placement.
2. Generate deterministic fixtures at 20, 500 and 1,500 shops; the largest target is roughly 150,000 products with 5–10 departments/shop where appropriate. Include multiple logical malls in neutrality tests, varied shop states, skewed inventories and real representative image assets; do not require 150,000 full image files.
3. Record warm-up and cold/warm cache methodology. Begin with a declared mixed workload such as 70% shop/deep-link reads, 20% searches and 10% writes/contact actions, then vary it based on pilot evidence. Use a safe synthetic workload, never real outbound enquiries/payment side effects.
4. Use a disclosed ramp, initially 5 → 10 → 20 requests/second with bounded duration and concurrency, and a separately measured hot-shop scenario. Record achieved throughput, errors, queue growth and saturation. These starting load levels are experiment inputs, not a projected customer capacity.
5. Measure p50/p95/p99 and record sample counts/duration. Measure browser usability separately under an agreed low-end phone/slow-mobile profile and, before launch, representative Ugandan connections when available.
6. Keep `EXPLAIN (ANALYZE, BUFFERS)` and DB/query evidence for representative synthetic reads; do not casually run state-changing diagnostics against production. Compare query counts/payload growth between small and large datasets.
7. Run update/closure/publication/rebuild scenarios while reads continue. Show timestamps from canonical commit through public/search visibility and verify unaffected shops stay cached.

### Proposed initial thresholds

| Area | Starting target | What to measure / caveat |
|---|---|---|
| Public shop response | p95 ≤300 ms warm; ≤800 ms cold at the agreed non-saturated load. | Server response separate from internet/browser rendering; report cache path. |
| Search response | p95 ≤500 ms for representative bounded queries on the largest dataset. | Include result hydration/eligibility and inspect query plans, not just DB execution. |
| Mobile usability | Aim for LCP ≤2.5 s, CLS ≤0.1 and measured INP ≤200 ms on the agreed representative profile. | Report lab and field results separately; INP needs real interaction measurement. Severe network profiles may need separately agreed targets. |
| Initial public transfer | Compressed HTML ≤80 KiB; initial JS ≤200 KiB; CSS ≤40 KiB; above-the-fold media ≤350 KiB. | Include RSC/route payloads and third-party/font bytes in total reporting; prefetch must not hide extra transfer. These are budgets to test, not proof of usability. |
| Lists/collections | Initial search near 20 shops; every public list/query has an enforced server-side cap. | Bounded total page/component/query complexity, independent of tenant/table size. |
| Ordinary update freshness | Writer sees canonical commit immediately; public price/content within 5 s and search within 10 s under nominal load. | Show pending/stale state and alert on breaches. Payment/entitlement truth is not eventual. |
| Closure/suspension | Recheck canonical eligibility for sensitive actions; propose ≤5 s visibility revocation for new public responses across caches/search. | Agree the precise policy; avoid full-page caching that cannot satisfy it. Content already downloaded to a customer's device cannot be recalled. |
| Image processing | Supported ordinary phone photos produce usable variants within 60 s under nominal queue load. | Declare size/pixel limits and worker resources; backlog shows pending status, never blocks browsing. |
| Benchmark correctness | Zero unexpected authorization/financial/state errors; ordinary HTTP error rate below a proposed 1% at agreed target load. | Any tenant leak or financial-integrity error fails regardless of aggregate error rate. |

Do not serve a cached page with unknown eligibility during a DB/status-service outage unless an explicit bounded-staleness policy permits it. Prefer an honest temporary unavailable response over exposing revoked/private content. Existing downloaded pages can be stale; all new platform-controlled sensitive actions must validate current eligibility.

If a target fails, isolate the cause, retain the failing measurement, make one justified change, and rerun the affected workload. Investigate indexes/N+1 queries, unbounded references, payload size, image choice, connection pools and worker contention before adding distributed infrastructure. Record any resource limitation instead of presenting a smaller test as the full benchmark.

### Recovery objectives to approve before live data

| Data class | Required decision and proof |
|---|---|
| Canonical DB, rent, identities, LSS, audit, retained enquiries | Approved maximum data-loss window (RPO), restoration time (RTO), backup/PITR method, independent copy and successful timed restore with reconciliation. |
| Media masters and private evidence | Accepted loss window, versioning/backup/retention policy, key access and restored object/reference integrity. Originals/masters needed for reconstruction are canonical assets. |
| Search and caches | Rebuild time objective and tested method that catches concurrent updates. These are not substitutes for DB backups. |
| Analytics | Agreed acceptable event loss/retention and aggregate rebuild procedure; no dependency for financial truth. |
| Credentials and deployment metadata | Separate secure key recovery/rotation and reproducible infrastructure configuration. A perfectly encrypted backup is useless without recoverable authorized key access. |

No production launch gate passes while recovery objectives are blank or a restore has never succeeded. The owner/operator chooses the cost-versus-loss tolerance; engineering proves the chosen mechanism meets it.

## 10. Source coverage and completion checklist

This matrix prevents less visible requirements from disappearing as implementation progresses. Phase assignment means planned coverage, not completed work.

| Repository source | Requirements carried into this plan | Execution coverage |
|---|---|---|
| [README](../README.md) | Product constitution, four surfaces, hierarchy, merchant lifecycle, low-bandwidth experience. | I01–I15; P0, P5–P9, P13 |
| [Master build instruction](../prompt.txt) | Current Next/Node stack, complete build, AI providers/orchestrator, seed/scale tests, deployment boundary. | P0–P12; G4/G5 |
| [Architecture](ARCHITECTURE.md) | Modular boundaries, internal malls, canonical updates, fault isolation. | P0, P2, P4, P7, P11 |
| [Data model](DATA-MODEL.md) | Tenant schema, immutable identity, roles, projections, closure versus deletion. | P2/P3/P8/P9 |
| [Technical specification](TECHNICAL-SPEC-V0.md) | Surface capabilities, state machines, events, consistency, portability and operations. | P2–P12 |
| [Product](PRODUCT.md) | Customer and merchant journeys, merchant autonomy, commerce language, arrears. | P0, P5–P9, P13 |
| [MVP](MVP.md) | Smallest trustworthy product, 10–20 merchant cohort, metrics and explicit later scope. | P5–P9, P12/P13 |
| [Decision register](DECISIONS.md) | Distinguish principles, hypotheses and open decisions. | P0; D01–D15 |
| [Security](SECURITY.md) | Tenant isolation, MFA, uploads, audits, trust, privacy and recovery. | P0/P3/P5/P9/P10/P12 |
| [Failure and recovery](FAILURE-RECOVERY.md) | Failure priorities, canonical/rebuildable data, RPO/RTO, restore and incident runbooks. | P4/P11/P12; section 9 |
| [Architecture stress test](STRESS-TEST.md) | Ten lifecycle scenarios, ten cross-system failures and business-risk assumptions. | P5–P13; T01–T26 |
| [Performance](PERFORMANCE.md) | Scoped reads, caching, images, jobs and measurements. | P4–P7/P11; section 9 |
| [Infrastructure](INFRASTRUCTURE.md) | Cloud availability, independent backup, logical/physical malls, measured scaling. | P1/P2/P12/P13 |
| [Search ranking](SEARCH-RANKING.md) | Shop identity, diversity, neutrality, cold start, language, abuse and quality metrics. | P7/P9/P13 |
| [Shop specification](SHOP-SPECIFICATION.md) | Safe semantic spaces, canonical references, revisions, budgets, versioning and fallbacks. | P5/P6/P10/P11 |
| [LSS JSON schema](SHOP-SPEC-SCHEMA-V0.1.json) | Typed structural contract, strict component properties and semantic validation gaps. | P6; T10–T12 |
| [Design pipeline](SHOP-DESIGN-PIPELINE.md) | Scoped intent, deterministic patches, conflict, preview/confirm, outage and audit. | P6/P10 |
| [Component building code](COMPONENT-BUILDING-CODE.md) | Registry contracts, platform-owned UI, accessibility/performance, embed policy and compatibility. | P1/P6/P11 |
| [Stack criteria](STACK-CRITERIA.md) | Maintainability, correctness, low-bandwidth UX, operational costs and evidence. | P0/P1/P7/P11; preserve criteria under chosen stack |
| [Stack comparison](STACK-COMPARISON.md) | Historical alternatives, simplicity, benchmark gate and limits on unnecessary infrastructure. | P0/P7; historical Django conclusion superseded |
| [ADR-0001](ADR/0001-initial-application-architecture.md) | Preserve original rationale/history and record explicit supersession. | P0 |
| [Vertical prototype](VERTICAL-PROTOTYPE.md) | Six concrete slices, Annette and 1,500-shop dataset. | P5–P7; G2 |
| [Business model](BUSINESS-MODEL.md) | Rent/resource policy, optional revenue, automation, support and financial metrics. | D07/D13; P8/P9/P13 |
| [Economics](ECONOMICS.md) | Contribution margin, collected rent, human support and per-shop variable costs. | P9/P13 |
| [Automation operations](AUTOMATION-OPERATIONS.md) | Guided onboarding, idempotent rent, triage, prioritized queues, human overrides. | P4/P8/P9/P10 |
| [Pilot experiment](PILOT-EXPERIMENT.md) | Baseline interviews, distinct traffic routes, events, actual renewal and decision report. | P9/P13 |

### Full-build completion requires all of the following

- [ ] Merchant application, operator review and verified activation/provisioning work end to end.
- [ ] Merchants can maintain departments/products/services/media, approved contacts and delivery/pickup terms.
- [ ] Validated LSS renders safe, accessible mobile shops; drafts/preview/publish/history/conflicts/rollback work.
- [ ] Public entrance/search/category/shop/deep-link/contact paths work without compulsory customer accounts.
- [ ] Search is shop-first, scoped, bounded and excludes ineligible/private content.
- [ ] Shopkeeper and Landlord have real authorization/MFA/security controls and usable failure states.
- [ ] Rent/state transitions, reconciliation, grace/closure/reopening and moderation precedence are verified.
- [ ] Conversational design follows provider-neutral, scoped, validated, explicitly confirmed publication; provider readiness is evidenced honestly.
- [ ] Media/jobs/projections are durable, bounded, observable and safe under retries/outages.
- [ ] Trust/reporting, audit, privacy and pilot analytics/cost instrumentation are useful and tested.
- [ ] Required security/regression/compatibility tests execute and pass; failures/skips/unrun checks are disclosed.
- [ ] Synthetic generation and a reproducible scale benchmark exist with recorded limits and results.
- [ ] Production build, tested setup/migration/seed commands, environment variable documentation and release artifacts exist.
- [ ] Backups, restore, deployment/rollback procedures and incident ownership are verified for the launch target.
- [ ] External capability gaps, unfinished scope and required owner actions are explicit; production deployment is reported only if authorized and performed.

## 11. Start here when implementation is authorized

The first change should be **P0 decision reconciliation**, not an application scaffold that perpetuates the Django/Next.js conflict. Keep that change focused: new architecture ADR, historical supersession notes, updated decision register, state/permission contracts and the task backlog derived from this plan.

Then implement P1–P4 in small reviewable changes, with tenant isolation and durable events established before feature development depends on them. Build the Annette vertical slice through P5–P7 and close G2 before widening the product. Continue P8–P12 until the requested build and release dossier are complete; use P13 to decide what deserves further investment.

At each checkpoint, report what is now demonstrably possible, the exact evidence, remaining limitations and the next dependency. Update this plan as requirements change, retaining the reason for each material scope or architecture decision.
