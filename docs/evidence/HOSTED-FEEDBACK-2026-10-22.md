# Hosted review feedback — 22 October 2026

This record covers the user's mobile/About/install, registration/search, policy, private
navigation, permanent-account bootstrap and report/privacy feedback. It is local verification
of the candidate, not access to the user's Render deployment or proof of real email delivery.

## Results and limits

- An empty canonical catalogue was exercised in the compiled hosted server: it returns a
  normal no-matches message. The reported search-unavailable screen indicates a failed query,
  not an empty database. Safe categories and support references now make that diagnosable;
  the actual live query failure was not reproduced or identified without its logs.
- Registration trims email whitespace, classifies client errors, checks email configuration,
  and no longer treats arbitrary authentication-library failures as successful registration.
  Hosted HTTP registration queued verification and created an unverified, unprivileged user.
  Terms acceptance is recorded for successfully created identities. No real Brevo call was made.
- The install prompt was previously captured only on the install page. It is now captured
  in the shared layout and retained during navigation. Simulated prompt, footer navigation
  and dismissal were verified. Physical OS installation remains a browser/device check.
- About, install and policy instructions are customer-facing. Landlord navigation is absent
  from the public footer and install page; knowing the direct URL still cannot bypass auth/MFA.
  Shopkeeper navigation retains verified membership checks. Explore shops remains public.
- About and the other changed public pages passed overflow checks at 320, 390, 768 and 1280px,
  plus automated accessibility checks. About screenshots were inspected at 390 and 1366px.
  Screenshots used explicit fixture mode; preview notices there are intentional.
- Existing trust intake/evidence/review/appeals now accept hosted configuration without
  dropping scope, conflict-of-interest, MFA, independent review, origin or queue controls.
- Hosted merchant privacy supports bounded exports, requests, assigned reviews, holds,
  explanations and non-destructive manual completion. Completion saves its outcome atomically
  before the immutable-history rule takes effect. Hosted erasure remains disabled, even if
  its development flag is true. No backups or third-party copies were deleted.
- Optional server-owned bootstrap creates permanent accounts once, refuses existing-email
  takeover and existing-operator replacement, serializes concurrent starts, preserves passwords
  and revoked grants, queues verification and requires landlord MFA. The shopkeeper gets an
  empty unpublished shop and explicit initial active access, not fabricated rent/payment data.
  The packaged bootstrap entry was executed. No production account was created in this session.
- Readiness requires migration 024 and accurately labels a failed hosted configuration.
  Landlord service status warns about a missing worker heartbeat.

## Tests executed

- `npm run build`: production web and independent worker/bootstrap artifacts passed.
- `npm run typecheck`, `npm run lint`, `git diff --check`: passed.
- Targeted unit suites `diagnostics`, `preview-config`, `services`, `p13`,
  `audit-followup`: **81 passed**.
- Integration suites `bootstrap`, `privacy`, `hosted-shops`, `p9`, `p13`, `ai-design`,
  `analytics`, `costs`, `p11`: **163 distinct tests passed across the targeted runs**.
  Disposable PostgreSQL databases were created and removed by the guarded test runners.
  The final added readiness test ran with eight previously passed hosted tests filtered out;
  these were skips in that targeted run, not eight additional passes.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- tests/e2e/hosted-feedback.spec.ts`:
  **4 passed**, across desktop and emulated mobile Chromium. Each responsive test covers all
  four viewport widths. Automated WCAG checks cover About/install/privacy/terms/sign-in.
- Configured-secret artifact scan passed for 1,801 artifacts and 37 configured candidates.
  This exact-value scan does not constitute a complete secrets audit.

Initial failures were fixed and affected checks rerun: a Zod chaining/type error during
implementation, migration-count expectations, and a manual completion attempt that wrote
its result after closure (correctly rejected by the existing immutability trigger).
No P12 recovery/production drills, live provider checks, Render changes or live migrations
were performed. No real credential values were printed, stored in evidence or committed.

## Deployment and remaining scope

Follow [the migration and first-account guide](../HOSTED-ACCOUNTS.md). Apply 024 with the
migrator, refresh runtime grants if applicable, use a worker for verification/recovery mail,
and set the optional bootstrap keys privately on the web service. Remove them after success.
Existing private `.env.local` and configured values were not changed.

Production application/provisioning/rent lifecycle, trusted ingress, full legal subject-rights
handling, automatic erasure, independent recovery and real provider acceptance are not
silently declared complete by these changes. Manual privacy review does not mean deletion.
Drafted terms/privacy copy needs the owner's actual contact and operational/legal review.

## Files added or changed

- `.env.example`
- `README.md`
- `deploy/.env.example`
- `docs/HOSTED-ACCOUNTS.md`
- `docs/RENDER-SETUP.md`
- `docs/evidence/HOSTED-FEEDBACK-2026-10-22.md`
- `migrations/024_hosted_accounts_and_privacy.sql`
- `scripts/build-worker.mjs`
- `scripts/release-entry.mjs`
- `scripts/release/bootstrap.ts`
- `scripts/start.mjs`
- `src/app/about/page.tsx`
- `src/app/api/register/route.ts`
- `src/app/globals.css`
- `src/app/install/page.tsx`
- `src/app/landlord/privacy/[id]/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/report/[shopId]/page.tsx`
- `src/app/report/page.tsx`
- `src/app/sign-in/page.tsx`
- `src/app/terms/page.tsx`
- `src/components/auth-controls.tsx`
- `src/components/canonical-directory.tsx`
- `src/components/canonical-shop.tsx`
- `src/components/lifecycle-controls.tsx`
- `src/components/policy-contact.tsx`
- `src/components/privacy-review.tsx`
- `src/components/privacy-workspace.tsx`
- `src/components/pwa-install-button.tsx`
- `src/components/pwa-registrar.tsx`
- `src/components/site-chrome.tsx`
- `src/components/trust-controls.tsx`
- `src/modules/privacy/contract.ts`
- `src/modules/pwa/install-prompt.ts`
- `src/server/bootstrap-accounts.ts`
- `src/server/db/schema-contract.ts`
- `src/server/diagnostics.ts`
- `src/server/privacy.ts`
- `src/server/readiness.ts`
- `src/server/registration.ts`
- `src/server/services/status.ts`
- `src/server/trust-http.ts`
- `src/server/trust.ts`
- `tests/e2e/hosted-feedback.spec.ts`
- `tests/integration/ai-design.test.ts`
- `tests/integration/analytics.test.ts`
- `tests/integration/bootstrap.test.ts`
- `tests/integration/costs.test.ts`
- `tests/integration/hosted-shops.test.ts`
- `tests/integration/p11.test.ts`
- `tests/integration/p9.test.ts`
- `tests/integration/privacy.test.ts`
- `tests/unit/diagnostics.test.ts`
