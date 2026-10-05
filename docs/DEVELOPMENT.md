# Development setup and verification

Use Node **24.19.0**, npm **11.9.0** and the checked-in lockfile. Commands below run from the repository root. X1 provides real local PostgreSQL sessions, MFA, permissions and durable jobs. X2 adds catalogue/contact/media commands, guest requests, safe manual design/preview/publication and eligible PostgreSQL public browsing. P8 adds local applications, private evidence, scoped MFA review, development rent reconciliation/provisioning and scheduled tenancy. P9 adds local anonymous reporting, private trust review, redacted appeals and truthful development verification. The fixture preview remains supported; live collection/providers, remaining P9 recovery/analytics/privacy, AI and release remain later stages.

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

Database mode serves `/`, `/search`, categories and shop/department/product routes from canonical data. Search shows at most 20 shops per page, one best context per shop, English stemming, validated cursor/category/shop scope and explicit failure states. Initial department views show up to 20 products; entrance shelves are bounded by the 32-card specification. Broader catalogue pagination and multilingual/relevance work remain full-build/P11 obligations. Stable UUID URLs redirect to current eligible slugs. Drafts and quarantine/source images never become public through these routes. No live report delivery or payment collection is claimed.

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

An approved/provisioned P8 application with private reviewed evidence produces only “Development application reviewed” on its public shop, with fictional/local limits and no identity/product/payment guarantee. Unreviewed shops show no badge. Merchant profile/LSS cannot supply it. Read [ADR-0008](ADR/0008-local-reporting-and-trust-review.md), [180-test evidence](evidence/X2-P9.md) and [journey diagrams](ILLUSTRATIONS.md). Broader incident procedures, analytics, approved retention/deletion/export and live policy remain remaining P9 gates.

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

Read [BUILD-STATUS](BUILD-STATUS.md), [RECOMMENDATIONS](../RECOMMENDATIONS.md), [R1 review](evidence/R1-REVIEW.md) and [X2-HANDOFF](X2-HANDOFF.md) before continuing. The P5–P8 local packets and P9 local trust packet are complete; continue remaining P9 at **Sol 6.1 Extra High**. Current checks pass 23 unit, 120 integration, 16 fixture browser and 21 core browser tests. See [current P9 evidence](evidence/X2-P9.md). See [administration evidence](evidence/X2-P8-ADMIN.md), [lifecycle evidence](evidence/X2-P8.md) and [historical prototype evidence](evidence/X2-P6-P7.md).
