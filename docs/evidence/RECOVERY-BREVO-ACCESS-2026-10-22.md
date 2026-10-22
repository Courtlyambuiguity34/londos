# Recovery UI and Brevo access check — 22 October 2026

## Findings

The hosted recovery screenshot contained a development-only notification-sink claim.
Inspection found that claim hard-coded in `RecoveryForm`, independent of configuration.
It did not demonstrate that Render was using the local adapter.

After the local integration tests, the actual configured Brevo key was used through the
environment's normal HTTPS proxy. `npm run email:verify` failed with its generic safe
configuration/access result. A bounded diagnostic GET to `/v3/account` returned HTTP 401
with provider code `unauthorized`. A follow-up read-only check confirmed the provider's
explicit **unrecognised IP** message and its official authorised-IP settings link.
Only the fixed classification, HTTP status and observed public egress IP were displayed;
the raw provider response, API key and account details were not logged or committed.

This confirms an access restriction for this environment, not the exact reason for the
separate Render delivery failure. Sender verification and sending could not be established
because the account-access preflight failed. No SMTP send endpoint was called, no real
email was sent, and no production accounts or delivery records were modified. No successful
key authorisation, sender approval or inbox delivery is claimed.

## Changes

- `src/components/auth-controls.tsx`: remove the inaccurate development claim, normalize
  the recovery address, distinguish acknowledgement from delivery, retain a safe support
  reference and display the existing sanitized authentication feedback on request failure.
- `tests/e2e-core/security.spec.ts`: check the corrected recovery notice and response
  reference at 390 × 844; verify no development/sink text or horizontal overflow.
- `docs/HOSTED-ACCOUNTS.md`: explain IP-based 401 rejection, different hosting egress
  addresses, and why the former recovery text did not reveal the selected adapter.
- This evidence file records the actual checks and remaining external restriction.

## Executed verification

- `npm run test:integration -- tests/integration/bootstrap.test.ts tests/integration/p13.test.ts tests/integration/core.test.ts`:
  **67 passed**, disposable local PostgreSQL; Brevo transport outcomes mocked. Includes
  verification, password reset, session revocation, MFA/role protections and delivery safety.
- `npm run build`: **passed**, including TypeScript and standalone/worker packaging.
- `npm run lint`: **passed**.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- security.spec.ts -g 'seeded-style unverified|notification reset links'`:
  **2 passed** using the compiled local app. Verification, reset, sign-in, operator denial,
  private referrers and the corrected mobile recovery copy exercised.
- Documentation links and `git diff --check`: **passed**.
- Real Brevo preflight: **blocked**, HTTP 401 unrecognised outbound IP. No send attempted.

To continue, authorise the intended sending service's outbound addresses in Brevo, retain
IP restrictions, then repeat the read-only preflight before a single authorised test email.
For Render, correlate the provided resend support reference with `verification.request`,
`verification.queued` and the matching job/provider outcome. No new environment variables
or migration are required for this UI correction. No unrelated recovery drills were rerun.
