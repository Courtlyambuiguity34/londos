# Verification request tracing — 22 October 2026

The supplied 15:10–15:11 UTC Render logs show successful startup, a Brevo worker and
maintenance jobs. They contain no verification job or provider outcome. The pasted
sign-in reference identifies an email-not-verified response, not its preceding resend.
These logs cannot establish whether a fresh resend queued or reached Brevo. No live
delivery success or production root cause is claimed.

## Changes

- `src/server/security/auth-http.ts`: overwrite the internal correlation header with a
  generated request ID; log resend HTTP results as `verification.request` without input.
- `src/server/security/auth.ts`: after inserting a verification job, emit
  `verification.queued` with job ID and a validated request reference when available.
- `src/components/auth-controls.tsx`: display the resend response reference and explicitly
  distinguish request acknowledgement from delivery. Existing sign-in submission clears
  the acknowledgement; no verification or permission bypass was added.
- `tests/integration/bootstrap.test.ts`: verify correlation to the persisted job, reject
  caller-supplied correlation IDs, keep identical public acknowledgements for unverified,
  unknown and verified addresses, and exclude private input from diagnostics.
- `tests/e2e-core/security.spec.ts`: verify the reference displayed by the real compiled
  mobile-sized sign-in page, notice clearing, verification/sign-in and operator denial.
- `docs/HOSTED-ACCOUNTS.md`: phone-only request-to-job-to-provider troubleshooting and
  explanation that expected authentication rejections need not log internal exceptions.
- This evidence file records the scope, execution and remaining live verification.

## Executed checks

- `npm run test:integration -- tests/integration/bootstrap.test.ts`: **3 passed** in a
  disposable local PostgreSQL database, including real Better Auth verification tokens.
- `npm run build`: **passed**, including TypeScript, standalone web assets and worker bundles.
- `npm run lint`: **passed**.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- security.spec.ts -g 'seeded-style unverified'`:
  **1 passed**, viewport 390 × 844. No hosted mail provider is used by this test.
- Documentation link check and `git diff --check`: **passed**.

No environment values, schema, hosted accounts or delivery records were modified. No live
email was requested or sent by this work. No full Docker rebuild or unrelated recovery
drills were rerun. The next production check requires deploying this code, requesting one
verification link, and following its resend reference in private Render logs. Provider
acceptance still does not prove inbox delivery; inspect Brevo activity if it is accepted.
