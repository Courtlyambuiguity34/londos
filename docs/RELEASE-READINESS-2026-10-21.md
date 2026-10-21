# Customer wording and release readiness — 21 October 2026

Hosted catalogue browsing and existing-merchant editing/publishing are working in the
compiled-server tests below. This is **not** evidence that every live shop-rental workflow
is complete. No Render deployment, real provider delivery, DNS change or production data
operation was performed during this review.

## Fixed in this change

- Hosted About and Shopkeeper pages no longer describe real businesses as fictional or
  label the workspace as development. The About page explains purchasing directly from
  merchants instead of displaying an inappropriate preview disclaimer.
- The shop footer replaces “this deployment” wording with a reporting-information link.
  The reporting page explains actual availability without advertising a working form that
  does not exist for hosted mode. Payment and emergency-service information stays accurate.
- Hosted application listing previously called a development-only service and could
  throw during rendering. It now renders an authenticated availability page.
- The hosted new-application page no longer offers a form that the server rejects.
  The public rent page directs existing merchants to sign in and states that new
  applications are closed. This repairs the user journey; it does not implement live onboarding.
- The local development application flow remains available. Fixture/demo notices remain
  in actual preview/local-adapter modes so sample records are not represented as real shops.

No new flag enables these presentation fixes. The existing hosted configuration uses
`LONDOS_DATA_SOURCE=database`, a configured core and `LONDOS_LOCAL_ADAPTERS=false`.
Do not enable local adapters on Render or delete guards to make unavailable workflows appear ready.

## What still prevents a complete live rental launch

| Area | Verified code or evidence gap | Work needed |
| --- | --- | --- |
| Shop applications and provisioning | `src/server/applications.ts` and `src/server/lifecycle-common.ts` enforce `local_lifecycle_only`. | Implement and verify the hosted application/review/provisioning path, production evidence handling and approved policy selection. An account registration alone is not an approved shop. |
| Rent and related operations | `src/server/rent.ts`, `src/server/jobs/rent.ts` and several administration/team operations retain local guards. | Complete production manual reconciliation and scheduled renewals with scoped MFA, idempotency, verified receipts and live policy/notification acceptance. Do not convert demo invoices into real payment evidence. |
| Concerns, incidents and privacy | Trust/incident functions are local-only; `src/server/privacy.ts` has `local_privacy_only` and development-policy constraints. | Complete hosted scoped case handling, private evidence lifecycle, subject-rights handling and recovery validation with actual retention rules and responsible operators. |
| Analytics | `src/server/analytics.ts` keeps local-only capture/aggregate restrictions. | Complete production consent/retention and aggregation acceptance before enabling it or promising real monthly visitor reports. |
| Trusted ingress | `src/server/security/auth-http.ts` still supplies loopback as the authentication client IP; the deployment guide requires a verified trusted-edge boundary. | Implement and test the selected ingress/header contract, including spoofed headers and separate-client abuse limits. Do not trust arbitrary forwarded headers. |
| Live services and operations | No live Render/provider verification was performed here. The existing launch manifest has pending evidence entries. | Verify the actual domain/TLS, email verification and recovery delivery, independent worker heartbeat, backups/restoration, key recovery and operator ownership. Record current evidence rather than reusing an old local drill as live acceptance. |

See [Render setup](RENDER-SETUP.md), the [release runbook](RELEASE-RUNBOOK.md),
and [the launch manifest](launch/G5-DECISIONS.json). The manifest records earlier evidence;
pending entries were not silently marked complete. These remaining items include code work
as well as deployment checks; supplying environment variables alone is not sufficient.

## Verification actually executed

- `npm run build`: passed, including standalone web and independent worker packaging.
- `npm test -- tests/unit/preview-config.test.ts tests/unit/audit-followup.test.ts`:
  **16 passed**.
- `npm run test:integration -- tests/integration/hosted-shops.test.ts tests/integration/p8.test.ts`:
  **33 passed**, using disposable development PostgreSQL databases. The hosted suite runs
  the real compiled server with local adapters disabled and fictional email settings;
  no worker sends those emails. Covers hosted wording, guarded-form availability,
  anonymous redirects, merchant/operator separation, publishing and tenant isolation.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- tests/e2e/public-preview.spec.ts`:
  **16 passed** across desktop and emulated mobile Chromium, including accessibility and
  overflow checks on the existing preview journeys. This is not physical-device testing.
- `npm run lint`: passed.
- `npm run typecheck` and `git diff --check`: passed.
- `npm run check:docs`: passed; 104 Markdown files and 773 local links.
- `npm run check:bundle-secrets`: passed for 1,778 artifacts and 37 configured
  candidate values. This is an exact-value check, not a comprehensive secrets audit.

The 65 targeted tests do not constitute a comprehensive live-release audit. No unrelated
P12 recovery drills were rerun. Secrets, database schema, billing state and authorization
rules were not changed.

## Files changed

- `src/app/about/page.tsx`: mode-aware customer information.
- `src/app/report/page.tsx`: accurate hosted reporting guidance.
- `src/components/canonical-shop.tsx`: reporting-information link.
- `src/app/rent-a-shop/page.tsx`: capability-aware sign-in/application action and rent wording.
- `src/app/shopkeeper/page.tsx`: hosted workspace wording.
- `src/app/shopkeeper/applications/page.tsx`: avoid guarded list call in hosted mode.
- `src/app/shopkeeper/applications/new/page.tsx`: avoid offering an unusable hosted form.
- `src/components/applications-unavailable.tsx`: shared authenticated availability view (new).
- `tests/integration/hosted-shops.test.ts`: compiled-server regression coverage.
- `README.md`: link to this readiness record.
- `docs/RELEASE-READINESS-2026-10-21.md`: this record (new).
