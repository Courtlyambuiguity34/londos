# Development setup and verification

Use Node **24.19.0**, npm **11.9.0** and the checked-in lockfile. Commands below run from the repository root. X1 provides real local PostgreSQL sessions, MFA, permissions and durable jobs. Public Mall/Shop rendering still uses clearly fictional fixtures; purchases, enquiries, uploads, rent reconciliation, LSS publication and AI are later stages.

## Public preview only

```bash
npm ci --no-fund
LONDOS_CORE_ENABLED=false npm run dev
```

`LONDOS_DATA_SOURCE=fixtures` remains the only public data source. It does not select the source of private records. `LONDOS_CORE_ENABLED=false` explicitly disables account/domain APIs, even if local database variables exist.

## Full local X1 environment

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

Open the ignored `.local/development-accounts.json` locally in an editor to obtain one fictional account's email/password. Never paste its contents into logs, chat, issues or commits. The seed creates owner A, owner B, restricted staff, an operator and an invitee with **random passwords**, and preserves existing credentials/edits on repetition. There is no deployed default administrator. The explicit seed bypasses email verification only for these fictional development identities.

Use the local browser sign-in page. Owners can access their private shop profiles; staff need both membership/action and per-shop grants. Public fixture shops do not change when a private PostgreSQL profile is edited. Operators are sent to account security until real MFA is enrolled and verified. Enter the setup key in a time-based authenticator (six digits, 30 seconds), save recovery codes offline and verify a code. A code can be used once; wait for the authenticator's next code when necessary. The next password login challenges for TOTP or one unused recovery code. Trusted-device bypass is unavailable; operator MFA cannot be disabled through the web adapter.

Sensitive membership/invitation/ownership/replay changes require fresh authentication (five minutes). Verify a current MFA code, or sign out/sign in again for a password-only merchant account. No membership browser UI is claimed yet: the reviewed domain APIs are listed in [X1-SECURITY](X1-SECURITY.md); ordinary forms follow R1.

Recovery and verification enqueue notifications. The running worker writes them under ignored `.local/notifications/` as private, complete, idempotent files. These are **local sinks**, not real email/SMS. An authorized local developer can open the appropriate file privately and use its link/token. Do not serve this directory through Next/public/object storage. Remote/live authentication and worker adapters fail explicitly until real providers and production configuration are implemented.

## Configuration and readiness

`.env.example` lists names/placeholders only. `db:local` generates `.env.local` with `DATABASE_URL`, `AUTH_SECRET`, `AUTH_BASE_URL`, `LONDOS_LOCAL_ADAPTERS=true` and fixture public rendering. Never use `NEXT_PUBLIC_` for a secret. Run commands from the repository root so web/worker agree about the local configuration and sink paths.

`GET /api/health` is liveness plus **public preview** capability; its `coreConfigured` and `readiness` fields point to the additional service check. `GET /api/ready` queries schema/configuration and reports actual local database/authentication capability and worker heartbeat. Worker offline is visible without failing public browsing. Live notifications and financial operations remain false. A database outage returns readiness 503 and private operations fail closed; public fixture browsing remains available.

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

Do not add a global streaming/loading boundary before resource validation. Private RSC denials are checked before rendering; both ordinary HTTP and Flight responses are tested. Keep private responses `private, no-store`, preserve public/account separation, and add every new protected endpoint to the attack fixture.

ESLint 10, TypeScript ESLint and React Hooks peers accept the pinned versions. Native rules require platform image components and prohibit raw scripts. The optional Next lint plugin was omitted after a High-stage unpatched dependency-chain advisory; no advisory/test was disabled. Reconsider it when repaired. X1 dependency additions were audited and frozen in the same lockfile.

Cloud onboarding uses `bash scripts/cloud-install.sh`: frozen install, guarded local DB startup/migrations/seed, checks, integration tests, audit, web/worker build and artifact scan. It does not start persistent web/worker processes. Saved environment settings are a draft; publishing/restoring is a separate platform step and has not been verified in a new task.

Read [BUILD-STATUS](BUILD-STATUS.md), [RECOMMENDATIONS](../RECOMMENDATIONS.md), [X1 evidence](evidence/X1-STAGE.md) and [X1-SECURITY](X1-SECURITY.md) before the **6 Astra Extra High R1** review.
