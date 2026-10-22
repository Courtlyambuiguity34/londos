# Sign-in feedback and uploaded embedded worker review — 22 October 2026

## Findings

The user's screenshot showed the old generic sign-in error. That message alone cannot
distinguish incorrect credentials, unverified email, rejected origin, or backend failure.
A read-only request to `https://londos.onrender.com/api/ready` returned `ready: true`,
`mode: configured-core`, `database: true`, `authentication: true`, `worker: ready` and
`liveNotifications: true`. This confirms readiness at that moment, not inbox delivery
or the user's account verification. No live sign-in, password guessing, recovery request,
database changes or provider email requests were made.

The uploaded `release-entry.mjs` added an embedded worker, but its supervisor treated
successful one-off completion as failure and discarded command arguments. Its default
also launched a worker in every web container, including existing separate-worker setups.
The uploaded `.dockerignore` matches the current fixed version. The uploaded startup
migration test has a duplicated unfinished `pool.query` statement, and the uploaded setup
document duplicates contradictory older paragraphs. Their useful intent was incorporated;
the working test and current documentation were preserved rather than overwritten.

## Changes

- `scripts/release-entry.mjs`: explicit `LONDOS_EMBEDDED_WORKER=true` starts web and worker
  after migrations/bootstrap; default remains false. Either child failing stops its peer;
  termination is forwarded and stubborn children have a bounded shutdown. Standalone and
  one-off commands preserve arguments and exit codes. Bootstrap secrets stay out of both
  serving/worker processes. An embedded worker shares free web suspension and uptime.
- `src/components/auth-controls.tsx`, `src/modules/auth/feedback.ts`: locally written,
  allowlisted error feedback; distinguish verification, credentials, rate limits and server
  availability without rendering raw server messages. Sign-in now offers verification
  resend, generic acknowledgement, destination-preserving callback, and recovery guidance.
- `src/app/sign-in/page.tsx`: expired/invalid verification callback guidance.
- `src/server/security/auth-http.ts`: normalize email before hashing/rate limiting and
  forwarding; preserve passwords exactly. Error support references match sanitized logs.
- `src/app/api/auth/[...all]/route.ts`: safe diagnostics for initialization failures too.
- `.env.example`, `deploy/.env.example`, `docs/HOSTED-ACCOUNTS.md`, `docs/RENDER-SETUP.md`:
  explicit embedded-worker setting, free-tier limitations, verification steps and the fact
  that changing bootstrap env passwords never resets an existing account's password.
- Tests: `tests/unit/auth-feedback.test.ts`, `tests/unit/embedded-worker.test.ts`,
  `tests/integration/bootstrap.test.ts`, `tests/integration/embedded-worker.test.ts`,
  `tests/e2e-core/security.spec.ts`.

## Executed checks

- Unit suites `auth-feedback`, `embedded-worker`, `release-start`: **17 passed**.
- Integration suites `bootstrap`, `core`, `embedded-worker`, `startup-migration`:
  **44 passed**. Includes actual seeded-account verification/resend/sign-in, wrong-password
  denial, unknown-email generic acknowledgement, no unverified session, role boundaries,
  and the existing authentication/security suite. The actual compiled embedded worker
  consumed bootstrap verification into the private local sink after startup migration and
  stopped cleanly. All databases were guarded disposable local databases, then removed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- security.spec.ts -g 'seeded-style unverified'`:
  **1 passed**, using a 390px viewport. Exercised the compiled application's registration,
  blocked sign-in, resend, verification link, successful sign-in, ordinary-user operator
  denial, no horizontal overflow and expired-link guidance. An initial test selector matched
  Next's hidden route announcer as well as the form alert; scoping it to main fixed the test.
- `npm run lint`, TypeScript checking, `npm run build` including postbuild: **passed**.
- Configured-secret scan: **1,801 artifacts / 37 candidate values passed**; exact-value
  scanning is not a complete secret audit.
- The production Docker build invocation was interrupted before a result was available;
  no new Docker image build is claimed for this change. The release entry and compiled
  worker were exercised by the process and database tests above.

No verification/MFA bypass, account takeover/reset via environment, or production data
mutation was added. Brevo delivery remains a live operational check. A queued request or
`bootstrap.complete` must not be described as an email delivered or an account verified.
