# Development setup and verification

Use Node **24.19.0**, npm **11.9.0** and the checked-in lockfile. Commands below run from the repository root. X1 provides real local PostgreSQL sessions, MFA, permissions and durable jobs. X2 adds private catalogue/contact/media work and anonymous requests through a separately enabled canonical contact page. Public Mall/Shop rendering still uses fictional fixtures; purchases, public media delivery/discovery, rent, LSS publication and AI remain later stages.

## Public preview only

```bash
npm ci --no-fund
LONDOS_CORE_ENABLED=false npm run dev
```

`LONDOS_DATA_SOURCE=fixtures` remains the only public data source. It does not select the source of private records. `LONDOS_CORE_ENABLED=false` explicitly disables account/domain APIs, even if local database variables exist.

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

Sensitive membership/invitation/ownership/replay changes require fresh authentication (five minutes). Verify a current MFA code, or sign out/sign in again for a password-only merchant account. No membership browser UI is claimed yet: the reviewed domain APIs are listed in [X1-SECURITY](X1-SECURITY.md); ordinary forms remain later work.

Password change/reset and factor removal revoke preceding sessions and pending MFA challenges. Sign in again and complete MFA as required. Losing active-owner authority permanently revokes that owner's unaccepted invitations; another current owner must issue a new invitation if appropriate. Accepted memberships are unchanged by that invitation policy.

Recovery and verification enqueue notifications. The running worker writes them under ignored `.local/notifications/` as private, complete, idempotent files. These are **local sinks**, not real email/SMS. An authorized local developer can open the appropriate file privately and use its link/token. Do not serve this directory through Next/public/object storage. Remote/live authentication and worker adapters fail explicitly until real providers and production configuration are implemented.

## X2 catalogue, contact and images

Open “Manage catalogue and contacts” from an authorized shop profile. Catalogue edits are private and versioned; reload after a conflict. Contact changes need sensitive permission and recent authentication. The enabled contact page works only for active publication/tenancy with clear moderation, and does not change the public fixture mall. Customer requests appear in the private inbox; no receipt confirms a sale or payment.

Uploads accept non-animated JPEG/PNG/WebP up to 4 MiB, 16 million pixels and 8192 pixels per side. The creating user uploads within 15 minutes. Quota is reserved atomically (128 MiB / 100 nondeleted assets per shop; 20 MiB per pending upload). Keep the worker running for processing, expiry cleanup and local notifications. Failed processing can be retried after its job reaches dead-letter state; rejected files require a new upload. Detach product references before deleting a ready image. Only authenticated ready display variants are readable; quarantine/source are private PostgreSQL blobs. See [ADR-0004](ADR/0004-catalogue-contact-and-private-media.md) for budgets and live-provider obligations.

Upgrade existing R1 databases by stopping old web/worker processes, applying migration 008, rebuilding and restarting matching code. Existing fields and application credentials were preserved in [X2 migration evidence](evidence/X2-MIGRATION.json). Original migration files remain immutable.

## Configuration and readiness

`.env.example` lists names/placeholders only. `db:local` generates `.env.local` with `DATABASE_URL`, `AUTH_SECRET`, `AUTH_BASE_URL`, `LONDOS_LOCAL_ADAPTERS=true` and fixture public rendering. Never use `NEXT_PUBLIC_` for a secret. Run commands from the repository root so web/worker agree about the local configuration and sink paths.

`GET /api/health` is liveness plus **public preview** capability; its `coreConfigured` and `readiness` fields point to the additional service check. `GET /api/ready` requires the named migration in `src/server/db/schema-contract.ts`, checks configuration, and reports local database/authentication capability and worker heartbeat. Worker offline is visible without failing public browsing. Live notifications and financial operations remain false. A database outage or missing required migration returns readiness 503; public fixture browsing remains available. Private operations fail closed on database errors.

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

The cloud machine already has system Chromium; use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` before either browser command here. The public suite launches port 3100 with core disabled; the private suite creates/migrates/seeds a separate random database, supplies random server credentials, launches port 3101 and deletes that database afterward. Each runner stops its own web server. Output directories are separate under ignored `test-results/{public,core}` and `playwright-report/{public,core}`. Traces contain fictional test credentials; do not publish them as production evidence.

The bundle scan checks exact configured local secret/password values in built client/server/worker files and rejects packaged environment files. It prints counts only. It does not replace full repository/production secret scanning. CI defines frozen checks, dependency audit, public browsers and a PostgreSQL security/browser job. Local success does not prove GitHub Actions has executed.

## Synthetic fixtures

```bash
npm run db:generate -- --shops=1500 --products=150000 --seed=londos-x1-scale-v1
```

The generator is local-guarded, deterministic and idempotent. It distributes products/services with hot shops, repeated-like content, prices, unavailable records and separate lifecycle states. Reusing a seed preserves existing rows; another seed creates a separate dataset. It does not delete data. The 1,500-shop/150,000-product target was generated twice and counted; this proves generator capability, not the planned architecture/load benchmark. Generated records remain in ignored local database storage.

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

Read [BUILD-STATUS](BUILD-STATUS.md), [RECOMMENDATIONS](../RECOMMENDATIONS.md), [R1 review](evidence/R1-REVIEW.md) and [X2-HANDOFF](X2-HANDOFF.md) before continuing. X2’s P5 packet is complete; continue P6 within **Sol 6.1 Extra High X2**. Current checks pass 19 unit, 62 integration, 16 public browser and 8 core browser tests. See [X2 evidence](evidence/X2-P5.md).
