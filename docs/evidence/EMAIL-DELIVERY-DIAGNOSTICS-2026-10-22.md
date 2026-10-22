# Verification email delivery diagnostics — 22 October 2026

The owner confirmed sign-in returns email-not-verified, then supplied Render logs.
Migration passed, bootstrap created zero additional users, the embedded Brevo worker
started, maintenance completed, and a job repeatedly failed with `handler_failed`.
Those historical lines lack the job kind and provider response, so they do not identify
the exact failure or prove Brevo never received a request. The PostgreSQL SSL-mode
warning is not the reported worker exception. A read-only public readiness request
also reported a configured core and ready worker; this is not a delivery receipt.

## Correction

- `src/server/jobs/brevo.ts` now logs `notification.delivery` after recording each new
  attempt's durable outcome. Fields are time, job ID, provider, outcome, HTTP status and
  a fixed safe category. HTTP 201 explicitly means provider accepted, not inbox delivered.
  Raw provider bodies, message IDs, addresses, credentials and verification URLs are omitted.
- `src/server/jobs/notification-diagnostics.ts` supplies fixed categories for key rejection,
  access denial, request rejection, rate limiting, server failure, network/timeout and
  invalid responses; pre-provider errors also distinguish origin, lease and database issues.
- `src/worker/main.ts` adds job kind and a safe notification category to failed-job logs.
- `docs/HOSTED-ACCOUNTS.md` explains how to read these events on a phone, check sender/API
  settings privately, distinguish local quota deferral from provider rejection, and review
  Brevo activity before retrying an uncertain outcome.
- `tests/unit/notification-diagnostics.test.ts` and `tests/integration/p13.test.ts` cover
  safe categories, diagnostic privacy, recorded outcomes and prevention of duplicate sends.

No retry, quota, account verification, reconciliation or credential policy was relaxed.
No schema migration or new environment variable is required. No live delivery record was
modified and no email was sent to the user or other recipients during this investigation.
Historic discarded responses cannot be reconstructed. A new provider attempt after this
release is needed to diagnose the live failure if the Brevo dashboard does not show it.

## Executed verification

- Notification-diagnostics unit tests: **8 passed**.
- P13 integration suite, including seven new mocked HTTP/network outcome cases:
  **25 passed**, against a disposable local database. Every outcome preserves the
  no-blind-resend rule; captured diagnostics exclude private sentinel content.
- `npm run lint` and `npm run build` (TypeScript and web/worker packaging): **passed**.
- Compiled embedded-worker integration: **1 passed**, processing verification into the
  private local sink after migration/bootstrap and terminating cleanly.
- Documentation link check and `git diff --check`: **passed**.

Brevo transports in tests were mocked; no real provider acceptance or inbox delivery is
claimed. No unrelated recovery or production drills were rerun. See the
[phone troubleshooting table](../HOSTED-ACCOUNTS.md#worker-ready-but-no-verification-email).
