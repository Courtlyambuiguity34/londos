# Development setup and verification

Use Node **24.19.0**, npm **11.9.0** and the checked-in lockfile. Commands below run from the repository root. X1 provides real local PostgreSQL sessions, MFA, permissions and durable jobs. X2 adds catalogue/contact/media commands, guest requests, safe manual design/preview/publication and eligible PostgreSQL public browsing. P8 adds local applications, private evidence, scoped MFA review, development rent reconciliation/provisioning and scheduled tenancy. P9 adds local reporting/trust/appeals, truthful development verification, assigned incidents/owner-confirmed recovery, analytics, governed local privacy and measurable resource-cost reporting. The fixture preview remains supported; live collection/providers, legal/backups/full subject-access, AI and release remain later stages.

## Public preview only

```bash
npm ci --no-fund
LONDOS_CORE_ENABLED=false npm run dev
```

`LONDOS_DATA_SOURCE=fixtures` selects the original public demonstration. `LONDOS_DATA_SOURCE=database` explicitly selects eligible canonical shops/search/media in the configured local core. It does not select the source of private records. `LONDOS_CORE_ENABLED=false` explicitly disables account/domain APIs, even if local database variables exist.

## Full local environment

Docker's managed local daemon must be available; do not start a second daemon as the cloud user. The setup tool clears remote Docker selectors while preserving platform credential/proxy configuration. PostgreSQL does not need outbound HTTPS; normal Docker pulls retain platform TLS/proxy handling.

```bash
npm ci --no-fund
npm run db:local
npm run db:migrate
npm run db:seed
npm run build
```

Then run web and worker in separate terminals:

```bash
npm run start -- --port 3000
npm run worker
```

For iterative development use `npm run dev` and `npm run worker:dev`. The production build packages a separate `dist/worker.mjs`; its runtime dependencies remain normal production packages. `tsx` is development/test tooling, not required to run the compiled worker. The web start wrapper loads root `.env.local` before standalone changes its working directory, retaining explicit process-variable precedence.

`db:local` starts pinned official PostgreSQL **18.6**, loopback port **54329**, named container `londos-development-postgres`, named persistent volume `londos-development-postgres`. It checks readiness, rejects unmarked/mismatched containers, preserves an existing `.env.local`, and generates random credentials only into ignored private files. Repeat setup is safe. `npm run db:stop` stops the container and retains its volume. The tool never deletes a volume or truncates an unknown database.

The local DB role is privileged to create isolated test databases. It is **development-only**, not a production service role. For an image upgrade: back up the explicit development volume first, verify its identity, stop/remove only that marked container without `-v`, then recreate with the reviewed image and retained volume; follow PostgreSQL upgrade instructions across major versions. Production upgrade/restore procedures remain P12 work.

## Accounts, MFA and recovery

### Upgrading an existing X1 database to R1

Stop the old web and worker processes before running `npm run db:migrate`, then build and restart both with the matching code. Migration `007_r1_security_contracts.sql` binds authentication to factor/credential generations, revokes outstanding invitations when their issuer loses owner authority, and rejects fractional minor units without rounding. Old MFA proofs are intentionally removed; users and otherwise valid sessions remain, but enrolled accounts must challenge again.

The money type conversion can rewrite/lock tables. Existing local records and repeated migration/seed were preserved in [R1 migration evidence](evidence/R1-MIGRATION.json); this is not production backup restoration or a downtime guarantee. Never edit applied migrations or roll back only the code across a schema contract change. Use a new reviewed migration for further changes.

Open the ignored `.local/development-accounts.json` locally in an editor to obtain one fictional account's email/password. Never paste its contents into logs, chat, issues or commits. The seed creates owner A, owner B, restricted staff, an operator and an invitee with **random passwords**, and preserves existing credentials/edits on repetition. There is no deployed default administrator. The explicit seed bypasses email verification only for these fictional development identities.

Use the local browser sign-in page. Owners can access their private shop profiles; staff need both membership/action and per-shop grants. Public fixture shops do not change when a private PostgreSQL profile is edited. Operators are sent to account security until real MFA is enrolled and verified. Enter the setup key in a time-based authenticator (six digits, 30 seconds), save recovery codes offline and verify a code. A code can be used once; wait for the authenticator's next code when necessary. The next password login challenges for TOTP or one unused recovery code. Trusted-device bypass is unavailable; operator MFA cannot be disabled through the web adapter.

Sensitive membership/invitation/ownership/replay changes require fresh authentication (five minutes). Verify a current MFA code, or sign out/sign in again for a password-only merchant account. Shopkeeper → Team now provides owner-only membership, invitations, ownership and per-shop staff controls. Invitation acceptance uses a password input and the signed-in recipient’s verified email; never place a token in a URL. The reviewed APIs are listed in [X1-SECURITY](X1-SECURITY.md).

Password change/reset and factor removal revoke preceding sessions and pending MFA challenges. Sign in again and complete MFA as required. Losing active-owner authority permanently revokes that owner's unaccepted invitations; another current owner must issue a new invitation if appropriate. Accepted memberships are unchanged by that invitation policy.

Recovery and verification enqueue notifications. The running worker writes them under ignored `.local/notifications/` as private, complete, idempotent files. These are **local sinks**, not real email/SMS. An authorized local developer can open the appropriate file privately and use its link/token. Do not serve this directory through Next/public/object storage. Remote/live authentication and worker adapters fail explicitly until real providers and production configuration are implemented.

## X2 catalogue, contact and images

Open “Manage catalogue and contacts” from an authorized shop profile. Catalogue editing remains private and versioned; approved catalogue data becomes visible in database browsing only when the shop publishes a design; reload after a conflict. Contact changes need sensitive permission and recent authentication. The enabled contact page works only for active publication, active/due/grace tenancy and clear moderation, and does not change the public fixture mall. Customer requests appear in the private inbox; no receipt confirms a sale or payment.

Uploads accept non-animated JPEG/PNG/WebP up to 4 MiB, 16 million pixels and 8192 pixels per side. The creating user uploads within 15 minutes. Quota is reserved atomically (128 MiB / 100 nondeleted assets per shop; 20 MiB per pending upload). Keep the worker running for processing, expiry cleanup and local notifications. Failed processing can be retried after its job reaches dead-letter state; rejected files require a new upload. Detach product references before deleting a ready image. Private preview variants require current catalogue/design scope. Public thumbnail/card/display variants additionally require a ready attached image, unarchived product/department and eligible published shop; quarantine/source are private PostgreSQL blobs. See [ADR-0004](ADR/0004-catalogue-contact-and-private-media.md) for budgets and live-provider obligations.

Upgrade existing R1 databases by stopping old web/worker processes, applying migration 008, rebuilding and restarting matching code. Existing fields and application credentials were preserved in [X2 migration evidence](evidence/X2-MIGRATION.json). Original migration files remain immutable.

## X2 shop design and public database browsing

Apply migration 009 after stopping old web/worker code, then build/restart matching processes. [Upgrade evidence](evidence/X2-P6-MIGRATION.json) preserves existing canonical fields, repeat seed and application credentials. The generated search vectors/indexes may lock/rewrite tables during upgrade; the local time is not a production downtime guarantee.

Select `LONDOS_DATA_SOURCE=database` in the private local configuration, or set it explicitly for the web process. Existing/new fixture setups are not forced into database mode by the installer. Open “Design and publish your shop” from its profile: choose a fixed theme, up to four entrance departments, approved contact action visibility and a plain-text announcement. Save a draft, arrange sections, inspect its private preview, then explicitly confirm publication with current publish permission and recent authentication. A restore creates a new draft and keeps current catalogue/contact data. Reload after conflicts. Only the original fictional seed shop may be prepared as a local demonstration; do not mass-publish or change unknown shops.

Database mode serves `/`, `/search`, categories and shop/department/product routes from canonical data. Search shows at most 20 shops per page, one best context per shop, English stemming, validated cursor/category/shop scope and explicit failure states. Initial department views show up to 20 products; entrance shelves are bounded by the 32-card specification. P11 implements full catalogue continuation; advanced multilingual/typo relevance remains future work. Stable UUID URLs redirect to current eligible slugs. Drafts and quarantine/source images never become public through these routes. No live report delivery or payment collection is claimed.

To reproduce the measured architecture experiment after building:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run benchmark:x2
```

This guarded tool creates/removes its own random test database, generates 1,500 shops/150,000 products, adds five collections per synthetic shop, prepares marked synthetic designs, and exercises the compiled server/worker on port 3102. It does not modify the existing development volume. It writes [benchmark measurements](evidence/X2-BENCHMARK.json), [the actual search plan](evidence/X2-SEARCH-PLAN.json) and a fictional search screenshot. Run it without concurrent test/load suites. Budgets are predeclared in [ADR-0005](ADR/0005-safe-design-and-canonical-public-reads.md); a failed budget causes a nonzero exit and must be investigated. The fixed read burst is not production capacity, sustained mixed-write load, mobile network or recovery proof.

## P8 applications and development rent

Stop only the old web/worker processes you own, apply migration **010**, build and restart matching code. [Upgrade evidence](evidence/X2-P8-MIGRATION.json) preserves existing data and credentials. Do not edit applied migrations or automatically convert existing fixture tenancies into rent contracts.

After ordinary local migration/seed, run `npm run db:p8` to enable **only the existing fictional review operator’s finance grant**. This guarded, repeatable command checks the local database and saved identity; it prints no credentials. The ordinary seed intentionally does not grant finance. Enroll/verify native operator MFA through Account security before review or reconciliation. Setup itself neither collects money nor provisions shops.

1. Sign in as an existing fictional owner (or previously invited account). Open Shopkeeper → Applications → Apply for a shop. Select an owned merchant account or create your own, complete business details and save the draft.
2. Upload one or two fictional verification images and confirm submission. JPEG/PNG/WebP inputs are bounded at **2 MiB**, single-frame, 16 million pixels and 8192 pixels per side; only normalized WebP is stored. Evidence is private and viewing it requires fresh authentication. Do not use real identity documents in this local demo.
3. Sign in as the MFA operator, open Landlord → Applications, claim the review and record a reasoned decision. A needs-information decision permits versioned editing/resubmission. Approval selects an immutable policy and issues a referenced invoice; it does not create a shop yet.
4. In Landlord → Development rent, separately claim finance scope. Compare the exact invoice reference, currency/amount and a unique external receipt with the fictional development ledger. Record a verified payment/waiver with reason and confirmation. Partial credits leave the application unprovisioned. Full first settlement creates an unpublished shop atomically.
5. The owner opens the invoice’s shop workspace, configures catalogue/contacts/design and explicitly publishes through the existing workflow. Use Rent and tenancy to open or request renewal. Reversals require the finance operator’s current scope, fresh MFA, reason and explicit confirmation; history is retained.

The default immutable policy is **UGX 5,000 per 30 fixed days, seven days’ grace**. A fresh finance operator may create another version with `POST /api/operator/rent-policies`; review lists versions with `GET` and chooses one at approval. The strict body fields are `label`, `amountMinor` (integer string), `periodDays`, `graceDays`, `mallCapacity` and `confirm: true`; currency is fixed server-side to UGX. Existing obligations keep their selected policy. No editor UI or live pricing approval is implied.

Coverage dates are provisional until first full settlement, then immutable. After coverage expires, the first overdue day is due, the remainder of the selected grace window is grace, then tenancy closes at the exact boundary. Grace zero closes at expiry. Run the worker for deduplicated three-day renewal reminders and due/grace/closure notifications in private local sinks. Old jobs re-read current canonical credit/coverage; renewal does not lift moderation. Only P8 contracts are scheduled. Receipt mismatches/overpayment are rejected for operator investigation, without effects.

Live collection, provider callbacks, refunds, public account signup, production verification storage/retention and launch policy remain disabled/unimplemented. The follow-on local administration packet is described below; see [the handoff](X2-HANDOFF.md) and [lifecycle evidence limits](evidence/X2-P8.md).

## P8 local teams and shop administration

Stop only the old web/worker processes you own, apply migration **011**, build and restart matching code. [010→011 evidence](evidence/X2-P8-ADMIN-MIGRATION.json) records preservation of all original fields in 26 tables and existing credentials. Default seed permissions remain unchanged. Run `npm run db:operations` explicitly to enable only the verified existing fictional operator’s operations grant; native MFA is still required. This does not grant application-finance or support scope.

1. As an owner, open Shopkeeper → Team, choose an owned merchant, and use the labelled confirmed command form. Invitation delivery is the private local notification sink. The recipient signs in and opens Shopkeeper → Accept invitation; copy the fictional token privately into the password input. Acceptance alone does not grant a staff member a shop: the owner must add explicit per-shop permissions.
2. Team commands compare the current merchant revision after locking. Another edit/acceptance may produce a conflict; reload the team and review the new state. Removing/demoting/transferring away the last owner is rejected. Former owners’ pending invitations stay revoked even if their role is restored.
3. Open the owner’s shop profile → Change shop address. Enter a slug, reason and confirmation. Existing addresses are permanently reserved to that shop; old links redirect only while the shop is eligible. Immutable IDs, financial contracts and ownership do not change. Staff cannot change addresses.
4. As the MFA operator, open Landlord → Shop operations for aggregate occupancy and a bounded minimal shop queue. Claim a shop with a reason and confirmation before opening private details. Self-administration is denied. Existing support/review/finance scope does not substitute for operations scope.
5. Use scoped operations to move to a mall or pause/resume, supplying current version, reason and confirmation. A full target mall refuses the move. Pause blocks public shops, search, contacts and ready images. Resume removes only the operational hold; it cannot renew rent, lift moderation or publish a draft. Commands retain append-only reasoned audit.
6. Landlord → Rent exceptions requires finance permission and separately claimed application-finance scope; it lists unsettled workflow invoices without broad financial access. Use the existing Development rent workflow for verified reconciliation/correction.

Lists use 20-row pages and the operations detail shows the latest 20 audit entries. There is no bulk-operation bypass. Financial arrangements/grace extensions remain unapproved; production accounting, mismatch investigation and larger history navigation remain plan obligations. See [ADR-0007](ADR/0007-local-administration-and-shop-addresses.md) and [160-test administration evidence](evidence/X2-P8-ADMIN.md).

## P9 local reporting, trust review and appeals

Upgrade with matching stopped web/worker processes, apply migration 012, rebuild and restart. Applied migrations 001–011 remain unchanged; never edit migration 012 after applying it. [Upgrade evidence](evidence/X2-P9-MIGRATION.json) preserves the existing main dataset and credentials.

Run `npm run db:trust` explicitly after local migration/seed. This verifies the existing fictional review operator before granting moderation, and creates/preserves a separate fictional independent reviewer with only moderation permission and no merchant memberships. Its random sign-in details remain in ignored `.local/trust-reviewer.json` (mode 600); read privately in an editor. Existing identity/file mismatches refuse setup rather than reset passwords. Repetition preserves both account files and configuration. Default seeds still grant no moderation. Each reviewer must enroll and verify native MFA; fresh authority and a separate case claim are required. This setup is local-only and does not enable signup or live moderation.

1. Open “Report a concern” from an eligible database shop, or the generic `/report` guidance. Anonymous intake requires a confirmed fictional concern, category and bounded message; no account is needed. Generic receipts disclose no private shop/case metadata and do not close shops.
2. Optionally attach one JPEG/PNG/WebP up to 2 MiB. Secure decoding removes metadata and stores only normalized WebP. Upload access expires after 30 minutes or the first case claim. Keep the page open for attachment retries; the private capability stays only in browser memory/request and is never a URL or receipt value. Do not submit real identity/payment documents or credentials.
3. In Landlord → Trust review, sign in as a configured reviewer, complete native MFA, then claim with reason/confirmation. The queue is bounded to 20, ordered by pending appeals, priority and age; report text/image remains private until scoped access. Active merchant self-membership denies review. Finance, support and operations claims do not grant case access.
4. Investigate using private notes/priority. Decide with current case/moderation versions, a private reason, separate merchant-facing explanation and confirmation. Stale versions conflict. Reports/attachments/events and captured legacy moderation baseline are immutable; closed cases refuse notes. Private image reads require fresh scoped MFA.
5. Fresh owners open “Trust decisions and appeals” from their shop profile. They see only redacted decisions, never reporter text/image, capability, private notes or reviewer identity. A versioned appeal permits one pending request. A different scoped reviewer must dismiss/reinstate the last restricting reviewer’s case; the original reviewer cannot clear it.
6. Restoration removes only that case’s restriction. Other trust cases, legacy moderation, rent, publication and operational holds remain authoritative. Conflicting external moderation changes fail closed. Both contact rendering and anonymous enquiry submission use shared eligibility, including operational holds. Notices go only to the ignored private local sink.

An approved/provisioned P8 application with private reviewed evidence produces only “Development application reviewed” on its public shop, with fictional/local limits and no identity/product/payment guarantee. Unreviewed shops show no badge. Merchant profile/LSS cannot supply it. Read [ADR-0008](ADR/0008-local-reporting-and-trust-review.md), [180-test evidence](evidence/X2-P9.md) and [journey diagrams](ILLUSTRATIONS.md). The following packets add authenticated-owner recovery and local analytics. Subsequent local governed privacy and cost-reporting packets are documented below; live legal/backups/full subject-access and policy remain P9 gates.

## P9 local incidents and owner-confirmed recovery

Stop only your matching old web/worker, apply migration **013**, build, then restart both. Never edit applied migrations 001–013. [Upgrade evidence](evidence/X2-P9-INCIDENT-MIGRATION.json) records preservation of 36 existing tables and private configuration/accounts. Contact history captures the current upgrade baseline and subsequent versions; unavailable earlier values cannot be reconstructed or claimed verified.

Run `npm run db:incidents` explicitly after guarded local migration/seed. It verifies the known fictional operator and adds recovery/support only, preserving credentials and ordinary seed privileges. It does not grant authority to the independent moderation-only reviewer. Real native MFA and separate case assignments remain mandatory.

1. As a freshly authenticated current owner, open Shopkeeper → your shop → Incidents. Select security, account recovery, contact/payment change, fraud, payment exception, verification or support; enter a fictional concern and confirm. Never include passwords, factor codes or real documents. Submission has a stable retry key; changed retries conflict.
2. For contact/payment-instruction recovery, select the exact known earlier revision. The UI shows the latest 20 available revisions. The target is fixed for that case. Create a new incident if the intended revision is different; an operator cannot supply arbitrary replacement fields.
3. In Landlord → Incidents, complete native MFA and claim with a reason/current version. Kind-specific grants filter minimal queues: recovery handles security/account/contact, moderation handles fraud, finance handles payment exceptions, review handles verification and support handles support. A separate incident assignment/scope is required for private details; merchant self-membership denies review. Each page is limited to 20 cases.
4. Add private investigation notes and priority, or provide a separate owner-facing explanation to escalate/resolve. Escalation releases assignment and private scopes; a qualified operator must claim again. Fraud/finance/verification decisions still use their separate trust/application workflows. Closing a case retains history.
5. For an eligible security/account/contact incident, an assigned recovery reviewer may contain the reporting active owner once. This invalidates all that owner’s sessions/proofs/pending MFA challenges and outstanding native reset tokens, and clears restoration approval. It does not change passwords, factors, email or membership. Owner sign-in must use the native password/MFA flow; previously issued reset links no longer work. Native password reset/change and existing one-use recovery codes remain the credential recovery mechanisms.
6. After containment/investigation, the original reporting owner signs in afresh, opens the case and explicitly confirms the displayed exact historical snapshot with current case/contact versions and a reason. Approval lasts 30 minutes and binds the owner’s current credential generation. Another owner cannot provide this approval. A later contact edit, expiry or password/factor generation change requires renewed confirmation.
7. The assigned recovery reviewer reloads and restores with native fresh MFA, reason and confirmation. The server rechecks assignment, scope, owner membership, generation and contact version after locks, validates the old snapshot with the current schema and appends a new canonical contact version. Competing restorations have one winner. All intervening contact history remains intact; rent, moderation, publication and operational holds are unchanged.

Ordinary support and legacy shop recovery scopes cannot call contact updates or perform containment/restoration. Lost-all-factor/email/ownership adjudication has no bypass and remains unavailable until an approved proof policy exists. Private notes/report/contact history stay out of public pages, queue metadata and local notification payloads. The notice sink remains private/ignored. Read [ADR-0009](ADR/0009-local-incidents-and-owner-confirmed-recovery.md), [199-test evidence](evidence/X2-P9-INCIDENTS.md), [incident runbook](FAILURE-RECOVERY.md) and [diagrams/captures](ILLUSTRATIONS.md).

## Local pilot analytics

Analytics was introduced by **014_local_pilot_analytics.sql**; current required migration is 016 (see local resource reporting below). Preserve applied migrations 001–014. Stop only your owned old web/worker before upgrades, apply checksummed migration, build and restart matching code. [Upgrade evidence](evidence/X2-P9-ANALYTICS-MIGRATION.json) preserves 40 original tables and the private configuration/accounts; it is not backup/restore proof.

After guarded local migration/seed, `npm run db:analytics` verifies the existing fictional review operator and adds only the new analytics permission. Repeated execution preserves credentials and existing/default grants. Native fresh MFA is still required; analytics grants no private application, incident, evidence, contact-history or ledger access. Ordinary seed never implicitly enables it.

Capture defaults off. For fictional canonical browsing, use `LONDOS_PILOT_ANALYTICS=true` with valid loopback/local adapters and `LONDOS_DATA_SOURCE=database`. `LONDOS_PILOT_RETENTION_DAYS` accepts an integer 7–90 (default 30 UTC calendar days including today). Process variables override `.env.local`; preserve user configuration rather than rewriting it. For an already configured database-mode local environment:

```bash
npm run db:analytics
npm run build
LONDOS_PILOT_ANALYTICS=true npm run start -- --port 3000
# In a separate terminal:
LONDOS_PILOT_ANALYTICS=true npm run worker
```

`/api/ready` reports `localPilotAnalytics` and `liveAnalytics=false`; historical [analytics runtime evidence](evidence/X2-P9-ANALYTICS-RUNTIME.json) verifies schema-014 web/worker; historical schema-016 runtime is recorded below; historical schema-017 runtime follows in P10; current schema-018 runtime follows in P11. Fixture/private preview never emits public events. Bots, internal native session cookies, DNT/GPC and default headless-browser traffic are excluded. The analytics browser fixture intentionally uses a normal fictional browser user agent to test capture. Do not treat authenticated operator browsing as real customer traffic.

Fresh owners open `/shopkeeper/shops/[shopId]/analytics`; staff/support cannot substitute for ownership. Native-fresh-MFA operators with the explicit analytics grant open `/landlord/analytics`. Window links are 7/30/90 days, clamped to retention. Owner authority is rechecked after merchant serialization; operator authority is rechecked after aggregate queries. These are bounded aggregate reads, not raw-event/private-record viewers.

Nine public events use signed 30-minute rendered contexts with atomic retry dedupe, strict target/channel binding and current canonical eligibility. At most ten per-tab shop/source entries persist for 30 minutes and a discovery click marker for two minutes; blocked storage stays unattributed. Counts measure page observations/contact intent, not unique visitors, verified sales or causal discovery. Two merchant-event counts derive separately from committed audit history and do not depend on capture storage. Search detail stores only zero/few/many; no query/IP/referrer/visitor identity is collected.

Capture uses a separate bounded pool and asynchronous 1.5-second browser requests; storage/rate failures return generic accepted receipts without blocking navigation or canonical writes. Reads immediately exclude expired metrics. The existing fenced maintenance job purges at most 1,000 expired receipts and 1,000 old metric groups per run. Invalid retention disables capture and aggregate deletion. A stopped worker leaves physical cleanup pending; do not claim expiry removed every row. P9.8 local primary/export governance is verified below; live legal/backups/full subject-access remain open; resource/support reporting is verified below. Live analytics remains disabled. Read [ADR-0010](ADR/0010-local-pilot-analytics.md), [222-test evidence](evidence/X2-P9-ANALYTICS.md) and [diagrams/captures](ILLUSTRATIONS.md).

## Configuration and readiness

`.env.example` lists names/placeholders only. `db:local` generates `.env.local` with `DATABASE_URL`, `AUTH_SECRET`, `AUTH_BASE_URL`, `LONDOS_LOCAL_ADAPTERS=true` and fixture public rendering. Never use `NEXT_PUBLIC_` for a secret. Run commands from the repository root so web/worker agree about the local configuration and sink paths.

`GET /api/health` is liveness plus **public preview** capability; its `coreConfigured` and `readiness` fields point to the additional service check. `GET /api/ready` requires the named migration in `src/server/db/schema-contract.ts`, checks configuration, and reports local database/authentication capability and worker heartbeat. Worker offline is visible without failing public browsing. `localRentWorkflow=true` reports only the development workflow; live notifications and financial operations remain false. A database outage or missing required migration returns readiness 503; public fixture browsing remains available. Private operations fail closed on database errors.

Changing the web port also requires the matching `AUTH_BASE_URL` origin. Mutation origins are checked exactly. Explicit test-runner variables override `.env.local`; do not change local credentials to make tests pass.

## Checks

```bash
npm run check
npm run test:integration
npm run format:check
npm audit --audit-level=high
npm run build
npm run check:bundle-secrets
```

`check` runs lint, strict types, public unit tests and local documentation links. `test:integration` creates a random `londos_test_*` database, migrates/seeds it, tests real PostgreSQL constraints/concurrency/auth/MFA/jobs, then drops **only that generated test database**. It rejects unknown/nonlocal production databases before mutation. No SQLite substitution is used. Crash drivers terminate separate processes at durable checkpoints. Database creation requires the explicit development role.

After building, install Playwright Chromium when needed and run both browser suites:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:e2e:core
```

The cloud machine already has system Chromium; use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` before either browser command here. The public suite launches port 3100 with core disabled; the core suite enables database browsing, creates/migrates/seeds a separate random database, supplies random server credentials, launches port 3101 and deletes that database afterward. Each runner stops its own web server. Output directories are separate under ignored `test-results/{public,core}` and `playwright-report/{public,core}`. Traces contain fictional test credentials; do not publish them as production evidence.

The bundle scan checks exact configured local secret/password values in built client/server/worker files and rejects packaged environment files. It prints counts only. It does not replace full repository/production secret scanning. CI defines frozen checks, dependency audit, public browsers and a PostgreSQL security/browser job. Local success does not prove GitHub Actions has executed.

## Synthetic fixtures

```bash
npm run db:generate -- --shops=1500 --products=150000 --seed=londos-x1-scale-v1
```

The generator is local-guarded, deterministic and idempotent. It distributes products/services with hot shops, repeated-like content, prices, unavailable records and separate lifecycle states. Reusing a seed preserves existing rows; another seed creates a separate dataset. It does not delete data. The 1,500-shop/150,000-product target was generated twice and counted; this proves generator capability; use the separate X2 benchmark for measured hierarchical rendering/search evidence. Generated records remain in ignored local database storage.

## Boundaries and tooling

- `src/modules`: public fixtures and bounded demonstration search; these helpers are not authorization.
- `src/server/db`: parameterized SQL, transaction/migration/seed/guard modules.
- `src/server/security`: maintained auth library adapter and explicit current-session/permission/tenant policies.
- `src/server/jobs`, `src/worker`: transactional enqueue, leases, handlers, local interfaces and independent scheduler/process.
- `src/proxy.ts`: private page authorization before HTML/Flight streaming, alongside handler/domain enforcement.
- `src/app`, `src/components`: server-rendered routes and small client authentication/profile controls.
- `migrations`, `tests`: additive/checksummed schema plus unit, real PostgreSQL and production-browser evidence.

Do not add a global streaming/loading boundary before resource validation. Private RSC denials are checked before rendering; both ordinary HTTP and Flight responses are tested. Keep private responses `private, no-store` and `no-referrer`, preserve public/account separation, and add every new protected endpoint to the attack fixture. Specific private header rules must follow global defaults. Library origin/CSRF checks stay enabled in tests as well as production.

ESLint 10, TypeScript ESLint and React Hooks peers accept the pinned versions. Native rules require platform image components and prohibit raw scripts. The optional Next lint plugin was omitted after a High-stage unpatched dependency-chain advisory; no advisory/test was disabled. Reconsider it when repaired. X1 dependency additions were audited and frozen in the same lockfile.

Cloud onboarding uses `bash scripts/cloud-install.sh`: frozen install, guarded local DB startup/migrations/seed, checks, integration tests, audit, web/worker build and artifact scan. It does not start persistent web/worker processes. Saved environment settings are a draft; publishing/restoring is a separate platform step and has not been verified in a new task.

Read [BUILD-STATUS](BUILD-STATUS.md), [RECOMMENDATIONS](../RECOMMENDATIONS.md), [R1 review](evidence/R1-REVIEW.md) and [X2-HANDOFF](X2-HANDOFF.md) before continuing. The P5–P8 local packets and P9 local trust/incident/analytics/privacy/cost-reporting packets are verified within their recorded limits; P10/P11 are locally verified at owner-confirmed **Sol 6.1 Extra High**. Current checks pass 61 unit, 251 integration, 16 fixture browser and 44 core browser tests; read [P11 evidence](evidence/X2-P11.md). Read [P10 evidence](evidence/X2-P10.md). See [current cost evidence](evidence/X2-P9-COSTS.md), [privacy evidence](evidence/X2-P9-PRIVACY.md) and [analytics evidence](evidence/X2-P9-ANALYTICS.md), [incident evidence](evidence/X2-P9-INCIDENTS.md) and [historical trust evidence](evidence/X2-P9.md). See [administration evidence](evidence/X2-P8-ADMIN.md), [lifecycle evidence](evidence/X2-P8.md) and [historical prototype evidence](evidence/X2-P6-P7.md).

## Local privacy governance

Privacy was introduced by **015_local_privacy_governance.sql**; current required migration is 016 (see reporting below). Preserve applied 001–015. [014→015 preservation](evidence/X2-P9-PRIVACY-MIGRATION.json) covers 42 original tables and three private files; conservative new closure timestamps do not alter original enquiry content. Stop only owned old app/worker before upgrade, migrate and run matching compiled code. This evidence is not physical backup restoration.

After guarded local migration/seed, `npm run db:privacy` explicitly adds only privacy to the verified fictional operator. It is repeatable and preserves ordinary seed grants/credentials. Native fresh MFA, exclusive assignment and separately claimed `operator_privacy_scopes` are still required. Other grants and active merchant membership cannot substitute. Do not write credentials into case reasons or exports.

Fresh owners open `/shopkeeper/merchants/[merchantId]/privacy`; reviewers open `/landlord/privacy`. Eight allowlisted export sections are tokenless authenticated downloads: 25 records per UUID page, or one shop/100 retained analytics groups, with a 512 KiB response budget. A multi-page export is not an atomic account snapshot. Private third-party material and account secrets remain excluded; original-actor applications/incidents are subject-scoped. Downloads may contain authorized business data and must be handled privately.

Primary erasure defaults **off**. Optional `LONDOS_PRIVACY_ERASURE=true` belongs only on matching app/worker processes against guarded fictional loopback databases when deliberately testing effects; it is not an approved live policy. Current main configuration was preserved with the flag off. `/api/ready` reports `localPrivacyErasure=false` and `liveErasure=false`. Browser/integration fixtures independently enable only their guarded disposable databases.

Development policy: manual review, at least 30 days from closed enquiry/rejected application, immutable policy version, no closure-triggered timer. Existing closed enquiries lacking reliable dates begin their retention clock at upgrade. Exact-target retention holds survive cancellation/denial/unassignment and require reasoned release. Approval binds native session/current plan for five minutes; reviewer/owner revocation, holds, changed target, aged MFA or lease loss prevent effects. Disabled/stopped workers leave execution pending. Releasing assignment clears approval and retains history/holds; qualified re-claim is available after prior grant/scope revocation.

Only mature closed-enquiry name/reply/message, eligible rejected nonfinancial own-application evidence bytes, and shop analytics groups have local primary effects. Analytics opt-out is permanent and fences waiting capture. Financial/account/trust/incident/contact/audit history and minimal enquiry retry receipt remain retained. SQL effect guards and atomic worker history/dedupe prevent ordinary direct erasure; production least-privilege roles still need release validation.

Completion does **not** erase WAL/backups/platform snapshots, private notification files, previous downloads or external copies. Before restoring data to service, reconcile immutable erasure and analytics exclusions from a trusted current source; see [recovery runbook](FAILURE-RECOVERY.md). Live legal periods, physical backup expiry/restore drill, native account deletion and full subject-access remain open. Read [ADR-0011](ADR/0011-local-privacy-governance.md) and [privacy evidence](evidence/X2-P9-PRIVACY.md). Cost reporting and P10/P11 are verified below; next is R2 at 6 Astra Extra High after the owner reports the switch.


## Local resource and reported cost workflows

This P9 packet used **016_local_resource_costs.sql**; current required schema is 018 in P11 below. Preserve applied **001–018**. [015→016 logical preservation](evidence/X2-P9-COSTS-MIGRATION.json) covers all original columns across 48 tables, repeated migration/seed and three private configuration/account files. It neither restores physical backups nor invents historical bills. Use the existing checkout; stop only owned old web/worker, migrate, build and restart matching code. Read [ADR-0012](ADR/0012-local-resource-cost-reporting.md) and [cost evidence](evidence/X2-P9-COSTS.md).

After guarded local migration/seed, run `npm run db:costs` to explicitly add only costs to the verified fictional operator. It is repeatable, preserves previous/default grants and private files, and does not create journal entries. Native fresh MFA is required. Owners open `/shopkeeper/shops/[shopId]/costs`; operators open `/landlord/costs` and explicitly claim a shop scope before `/landlord/costs/[shopId]` private journal access. Analytics, support, finance, operations and privacy scopes do not substitute. Active merchant self-membership is denied. No provider credential is required for this local reporting packet.

Source labels separate current logical SQL media bytes, recorded quota/headroom, shop-bound job counters, platform shared-job/evidence totals and operator-reported work. Missing quota is unavailable; reserved bytes are not stored bytes. Authorized replay resets attempt counters; current job rows do not measure lifetime executions, elapsed time or CPU. Bandwidth, reconciled AI bills, actual provider prices and independent staff timers are unavailable. P10 below adds reported AI tokens/configured estimates when present. Case age is not working time. Owner aggregates exclude private reasons, operator identities and application/trust evidence volume.

Choose 7/30/90 UTC calendar-day summaries. Journal UUID pages contain at most 20 entries across all work dates. For fictional support/verification/rent-collection work, record 0–480 integer minutes and/or UGX 0–1,000,000,000 integer expense minor units, an eligible UTC work day in the last 90 days, a bounded private reason and explicit confirmation. Do not put real personal information, passwords or recovery codes in reasons. Minutes and money remain separate; no hourly rate or merchant charge is inferred. At most 100 originals per shop per UTC creation day are accepted, including when PostgreSQL uses a non-UTC timezone. Exact corrections are still permitted at that limit.

Reload on a version conflict and review the current journal; never silently overwrite history. An unchanged retry uses its original key/body, even after a lost response; changed payload/key reuse conflicts. Correct a mistaken entry with a reasoned exact linked reversal, then record the intended replacement if needed. Original and correction remain immutable, with at most one correction per original. Net summaries use the original work day, not the correction date; zero net reported work still has unknown coverage. No entries means actual time/expenses are unmeasured. See [recovery instructions](FAILURE-RECOVERY.md).

[Historical costs runtime](evidence/X2-P9-COSTS-RUNTIME.json) verifies schema-016 app/independent worker, public browsing and anonymous costs denials. The main journal is empty; native browser/integration tests use guarded disposable databases. Main/default privacy erasure and all live collection/analytics/notifications/erasure remain disabled. Cost queries have fixed output shapes and two-second statement timeouts; query failures must not affect canonical writes or existing queue behavior. Production rates/provider accounting, legal history retention and database roles remain release obligations. P10/P11 are locally verified below; R2 requires **6 Astra Extra High** and the owner-reported switch.

## P10 private conversational design

P10's historical required migration was **017_conversational_design.sql**. P11 now requires **018_catalogue_pagination.sql**; preserve applied **001–018**. [P10 evidence](evidence/X2-P10.md) records 344 tests (52 unit, 238 PostgreSQL integration, 16 fixture and 38 core browsers), [51-table/three-private-file preservation](evidence/X2-P10-MIGRATION.json) and [matching runtime](evidence/X2-P10-RUNTIME.json). No dependency changes. P11 local validation is complete below; next is R2 at **6 Astra Extra High** after the reported switch. Previous packet evidence remains historical.

Owners or staff with both native design membership/shop grants open `/shopkeeper/shops/[shopId]/design/assistant` after fresh native authentication. Without enrolled MFA, the existing five-minute native sign-in freshness rule applies; enrolled MFA requires a current verified proof. Original requester controls each private proposal. Four protected methods are GET/POST `/api/workspace/shops/[shopId]/design/assistant` and GET/POST `/assistant/[id]`; `/shopkeeper/shops/[shopId]/design/assistant/[id]/preview` renders a canonical unsaved candidate. Native origin, bounded JSON, private no-store/no-referrer and authority checks apply. Applying requires explicit confirmation/version/unchanged current bounded context and review-warning acknowledgment when offered. Application creates a draft; the existing publish endpoint separately rechecks fresh publish authority, owned resources and shop eligibility. Public routes make no provider calls.

Try `Use plum theme`, `Remove the call button`, `Keep WhatsApp visible`, or exact unique `Move Shoes before Handbags` when those departments exist in the saved design. These paths need no credentials, external consent or paid review. Other language needs explicit merchant consent plus configured remote processing. Failure/outage/quota/conflict preserves templates/manual design and prior published revisions. Provider-generated arbitrary code/HTML/SQL execution is unavailable; output must compile through the closed intent and full canonical LSS/reference budgets.

Remote processing defaults **off** (`LONDOS_AI_REMOTE=false`). Configure optional personal Gemini keys `GEMINI_API_KEY_1` through `_5` via the actual secure deployment facility, selected slot 1–5 (default 1). Managed cloud reserves `OPENAI_API_KEY`; bind `LONDOS_OPENAI_API_KEY` to `api.openai.com`, while direct deployments may use the standard name. Gemini destination is `generativelanguage.googleapis.com`; transports fix HTTPS endpoints and reject redirects. Keep native proxy/CA/TLS trust; Node 24 proxy support must be enabled at process startup (`NODE_USE_ENV_PROXY=1` or `--use-env-proxy`). The production wrapper initializes it when a proxy is present; it preserves an explicit existing setting. Never put credentials in Git, chat, client variables or logs.

Require explicit verified `LONDOS_AI_GEMINI_MODEL` / `LONDOS_AI_OPENAI_MODEL` and approved nonnegative integer `LONDOS_AI_{GEMINI,OPENAI}_{INPUT,OUTPUT}_MICROUSD_PER_MILLION`. No model or price is guessed. Daily configured-estimate allowance is `LONDOS_AI_DAILY_COST_MICROUSD` (default 1,000,000, USD 1); this is not billing. `LONDOS_AI_ALLOW_OPENAI_FALLBACK` and `LONDOS_AI_AUTH_FAILOVER` default false. Optional failover tries one authentication-only spare; quota/cooldown never rotates keys or providers. OpenAI selectively reviews quality/low-confidence/recommended/successful-repair candidates; all review output is revalidated. Logical roles do not require four calls.

Bounds are 2,000 instruction characters, 32,000 context bytes, 65,536 transport response bytes, 8,192 output-text bytes, 2,048 output tokens, three attempts, one repair/transient retry, eight-second provider and 30-second overall deadlines, 40-second lease, 15-minute candidate TTL, one active request/shop and three globally. UTC-day budgets admit at most 20 requests and one million conservatively reserved tokens/shop. Each remote request reserves all allowed calls at the highest configured estimate; failures/missing usage do not refund reservation. Shared durable `Retry-After` cooldowns prevent retry storms. Already admitted remote usage cannot be retroactively refunded/cancelled.

No raw prompt/instruction/invalid output/provider error body is stored. Applying/rejecting/cancelling/expiring scrubs validated candidate/patches; immutable minimal terminal receipts and redacted attempts remain. Existing lease-fenced maintenance scrubs bounded expired/dead-lease rows; immediate expiry enforcement does not depend on worker timing. Production metadata retention/legal terms and physical backup treatment remain release obligations. Assistant and P9 cost views show provider-reported tokens, fixture/live-transport labels, configured USD estimates and missing usage separately from reconciled bills/UGX reported work.

Run `npm run ai:verify` for redacted capability observations; `npm run ai:verify -- --require-live` requires both configured live contracts to pass. It uses bounded fictional data and one real request per configured provider, no merchant data or provider-body logging. Current [observations](evidence/X2-P10-PROVIDERS.json) show neither provider available; no live request occurred. Fake CI adapters establish deterministic contract/control coverage only. Verified models, design quality, real rates and billing remain external gaps. Do not enable main remote processing or erasure merely to claim readiness.

## P11 semantic design, pagination and validation

Required migration is **018_catalogue_pagination.sql**. Preserve applied 001–018, existing data, ignored credentials and earlier evidence. Stop only the current web/worker before upgrading; run migration/seed, build and restart both. Migration 018 adds statement-level catalogue generations without an old-row backfill. [ADR-0014](ADR/0014-bounded-semantic-spaces-and-catalogue-pagination.md) describes compatibility and coordinated reader/writer rollout. [Provider settings](AI-ENVIRONMENT.md) records the prepared model choices, missing key bindings and verified-price requirement. Main remote AI remains off.

In Shopkeeper → Shop design, select a semantic section, add bounded plain text or current owned catalogue items, save, preview and separately confirm publication. Galleries require ready attached photos and alt text. Collections select a department/kind/availability before applying their 1–8-card SQL bound. Offers/service desks create no automatic discounts, financial events or confirmed reservations. All 100 bounded departments are linked publicly. Department pages use native **Next products** and **First page** links; an intervening catalogue/resource change offers **Restart department**. Image failures keep the text and provide a keyboard-accessible **Retry image** action.

Verification commands (from the root, with the documented local database):

```bash
npm run check
npm run test:integration
npm run format:check
npm audit --audit-level=high
npm run build
npm run check:bundle-secrets
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core
npm run check:clean
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run benchmark:p11
```

Use the explicit system Chromium path when installed; otherwise follow the existing Playwright browser installation instructions. `test:integration` and `test:e2e:core` accept optional file filters; their disposable databases remain guarded. `check:clean` copies tracked/nonignored source to an owned temporary checkout, installs from the lockfile, migrates/seeds a separate guarded database twice, checks/builds/scans and removes only that copy/database. It copies no private files or provider credentials and does not bootstrap/delete the existing Docker volume. `benchmark:p11` runs alone after build, forces remote AI off, creates/removes its own generated database, and retains distinct P11 reports rather than overwriting the historical X2 benchmark. It needs loopback ports 3102/3103 free.

Production domains/TLS, service roles, remote storage/notifications/collection, legal/privacy terms, ingress/CDN behavior, physical recovery and actual assistive-technology/device/network certification remain explicit owner/operator release gates. The local commands establish their recorded scope only.
