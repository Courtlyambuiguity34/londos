# Communications and manual-billing verification · 2026-10-10

Branch: `feature/communications-billing-2026-10-10`

Scope: shopkeeper registration/verification, native password recovery email rendering, shop welcome,
rent/payment reminders, manual external-payment claims, operator reconciliation, promotions, scoped
campaigns, optional aggregate monthly reports and Brevo quota deferral. No real message was sent.

## Verified results

| Check | Result |
| --- | --- |
| `npm run check` | PASS: lint, typecheck, 171 unit tests, 722 links in 89 Markdown files |
| `npm run test:integration` | PASS: 289 tests in 15 files |
| `npm run build` | PASS: production web/worker artifacts and new routes compiled |
| `PLAYWRIGHT_BROWSERS_PATH=.local/ms-playwright npm run test:e2e:core` | PASS: 49 desktop/mobile tests |
| One-click local launcher | PASS: database, compiled web and worker started; readiness was true |
| `/register` production smoke | PASS: HTTP 200 with verification-first registration form |
| anonymous `/landlord/communications` smoke | PASS: HTTP 307 to authentication boundary |

The first direct browser-suite attempt could not launch because this cloud image had no Playwright
Chromium binary. The pinned runtime was downloaded to the ignored `.local/ms-playwright` directory,
and the complete rerun passed 49/49. It is not an application/runtime dependency.

## Security and behavior established

- Registration creates an unverified identity, queues verification, grants no membership/operator
  permission and blocks sign-in until verification. Duplicate submission returns the same public
  response.
- HTML templates escape campaign content and reject off-origin verification/recovery actions. Live
  adapter attempts deny reserved fictional recipient domains.
- Payment claims remain pending until an MFA-protected finance operator reconciles the exact external
  reference. Claims do not activate rent by themselves.
- Promotion redemptions produce a single auditable waiver and do not create a parallel payment path.
- Specific campaign/promotion announcements derive recipients from verified active owner
  memberships and remain shop-scoped.
- Monthly reports contain aggregate recorded actions and explicitly do not claim unique visitors or
  sales.
- PostgreSQL reserves hourly/daily Brevo quota atomically. Excess work is deferred without a provider
  call, delivery artifact or consumed retry attempt.
- Provider receipts, logs and database delivery records retain no API key, recipient address, action
  token or response body.

## Boundaries

Tests used fictional recipients, local notification storage and mock Brevo transports. They prove
logic and provider-request contracts, not sender verification, production credentials or inbox
delivery. `LONDOS_MONTHLY_REPORTS_ENABLED` remains false by default. Live collection remains disabled;
all merchant payments are external and manually verified.
