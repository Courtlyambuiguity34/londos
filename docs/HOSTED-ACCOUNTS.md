# First permanent accounts and hosted troubleshooting

Updated 22 October 2026 (Africa/Kampala). PostgreSQL remains the account and shop database.
MongoDB public copies cannot create accounts or replace PostgreSQL. No shared or published
administrator password is supplied.

## Upgrade before starting

1. Back up the database and use the reviewed release procedure. Deploy the same candidate
   to web and worker. Apply its migrations with the migrator role before starting the new web
   code. This change adds `024_hosted_accounts_and_privacy.sql`; it does not edit an applied
   migration or erase existing records.
2. In a built owner checkout, privately supply the production PostgreSQL settings and run
   `node dist/migrate.mjs`. In the production image use `node release-entry.mjs migrate`
   (or the image command `migrate`). The release entry supports `LONDOS_RUNTIME_CA_FILE`.
   When using the direct command with a provider CA, set `NODE_EXTRA_CA_CERTS` to its public
   certificate path. Never disable TLS checking. No Docker installation is needed when
   executing these Node commands from a checkout or an available hosted shell/job.
3. Refresh runtime database grants for newly added tables if you use separate runtime roles;
   the release role setup in [the runbook](RELEASE-RUNBOOK.md) discovers current tables.
   Never put migrator credentials in browser code.
4. Keep the existing `DATABASE_URL`, `AUTH_SECRET` and exact HTTPS `AUTH_BASE_URL`.
   Use `LONDOS_CORE_ENABLED=true`, `LONDOS_DATA_SOURCE=database`,
   `LONDOS_LOCAL_ADAPTERS=false`, and your valid Brevo configuration on both services.
   These values select the real catalogue; the root fixture-preview blueprint is different.
   Do not enable local adapters to obtain permissions or bypass a missing workflow.
5. Run an independent worker against the same database and origin (`node dist/worker.mjs`
   in a checkout, or image command `worker`). Verification mail is queued in PostgreSQL;
   a running web server and a Brevo key alone do not send it. Check `/api/ready` for
   `worker: ready`. Alternatively, enable the explicit embedded option below. A free web
   service is not an always-on worker, even when a worker runs inside its container.

## Embedded worker and sign-in troubleshooting from your phone

If you have no separate worker, set `LONDOS_EMBEDDED_WORKER=true` on the Docker **web**
service and redeploy. Keep the Docker command `web`. The default is false, preserving
separate-worker deployments. Migration and bootstrap finish before web and worker start.
`release.embedded_worker_started` records that the worker process was spawned; also look
for `worker.started` with `adapters: brevo` and a ready worker heartbeat. Either child
exiting unexpectedly stops the other, so the container can restart rather than leaving
a healthy-looking site with a dead worker. Standalone `worker`, `migrate`, `bootstrap`,
`monitor`, and `worker-health` commands keep their original arguments and exit status.

The embedded worker uses the same database/secret/CA/Brevo settings as the web process.
Do not enable it in addition to a separate worker unless you deliberately want both.
Free Render web suspension stops both processes: email and scheduled work wait until
the container resumes. Staying on a page does not guarantee uptime. For dependable
delivery use an always-on worker. An email quota deferral, provider rejection or unknown
delivery outcome must not be bypassed by resetting durable delivery records.

`bootstrap.complete` means the accounts were created (or already existed), **not** that
their email was delivered or verified. New permanent accounts deliberately require email
verification. To sign in:

1. Use the exact website origin configured by `AUTH_BASE_URL`.
2. Use the password entered when that account was first created. Changing a bootstrap
   environment password later does not change the saved password. Use **Recover your
   account** if you have forgotten it; never delete the bootstrap receipt to reset it.
3. Open the newest verification email. If it expired or never arrived, enter your email
   on the sign-in page and choose **Resend verification email**. This does not require
   registration again or knowing the password. Requests are rate limited, and unknown
   addresses get the same public acknowledgement.
4. Check inbox and spam. The acknowledgement means the request was handled, not that
   Brevo delivered it. When sign-in returns `EMAIL_NOT_VERIFIED`, the page now explains
   verification instead of showing a generic failure. Invalid password and temporary
   service failures have different safe instructions.
5. After verification, sign in. Landlord MFA and assigned-shop permissions still apply.

If email is still missing, check `worker.started` uses `brevo` (not `local-private-sink`),
and review Brevo's transactional email activity and verified sender in its dashboard.
Check the configured daily quota and whether jobs log `job.failed` or `job.deferred`.
The browser displays a safe request reference for supported failures. Internal exceptions
produce `authentication.failed`; expected library rejections such as unverified email do
not necessarily emit that event. Never share passwords, tokens or connection URLs.

### Worker ready but no verification email

The sign-in page acknowledges a request without revealing whether an address exists.
That is not an inbox-delivery receipt. `bootstrap.complete` and `/api/ready` are not
email-delivery receipts either. In Render Logs, inspect the events after requesting
one fresh verification message (do not repeatedly request links):

The resend acknowledgement now includes a **Resend support reference**, distinct from the
reference for a later failed sign-in. From your phone, copy that resend reference and search
Render Logs for it after deploying this update:

1. `verification.request` records the HTTP result. A 200 acknowledges handling only:
   unknown and already-verified addresses intentionally get the same public response.
2. `verification.queued` with the same `requestId` confirms a verification job was inserted
   and supplies its `jobId`. Search for that job ID to find worker/delivery events below.
3. A 200 with no matching queued event, in complete logs from this release, means the
   library did not enqueue a new email for that request. Check the exact entered address
   against the account used for sign-in; do not recreate accounts or change bootstrap passwords.
4. A queued event without worker activity means delivery has not been demonstrated. Check
   worker availability and the same database configuration; maintenance events alone cannot
   confirm that particular job was processed.
5. No matching request event may mean the wrong time range, an older deployed version, or
   an early rejected request. Check the latest deploy commit and the exact time of the resend;
   the support reference on an email-not-verified sign-in is not the resend reference.

Only generated references, job IDs and status are logged. Addresses, passwords and action
links are excluded. These events are private operational logs, never a public account lookup.
The acknowledgement explicitly says it does not confirm delivery and clears on another
sign-in attempt. No new environment variables, migrations or terminal access are needed.

| Event/category | Meaning and next step |
| --- | --- |
| `worker.started`, `adapters: brevo` | Correct adapter selected; it does not prove provider access. |
| `notification.delivery`, HTTP 201, `provider_accepted_not_delivery_confirmed` | Brevo accepted the API request. Check Brevo transactional email activity for delivered, deferred, bounced or blocked status, then the recipient's inbox/spam. |
| HTTP 401, `provider_api_key_rejected` | This status-based category does not distinguish an invalid key from Brevo IP restrictions. Check Brevo's authorised IP settings and API key status. Use an **API key**, not an SMTP password; replace it privately only if invalid/revoked. |
| HTTP 403, `provider_access_denied` | Check Brevo account/API permissions, transactional sending activation and provider access restrictions. |
| HTTP 400, `provider_request_rejected` | Brevo rejected the request. Check its dashboard and ensure `LONDOS_EMAIL_FROM` is an active verified sender; HTTP 400 alone does not prove which field was rejected. |
| HTTP 429, `provider_rate_limited` | Brevo rejected for provider rate/quota limits. Check the provider allowance; do not raise local limits beyond it. |
| `job.deferred`, `provider_quota` | Londos deferred the message before making a provider request because its configured hourly/daily budget was used. Wait for the budget window. |
| `provider_server_error` / `provider_network_or_timeout` / `provider_response_invalid` | Delivery outcome is uncertain. Check Brevo activity before requesting another message; a timeout does not prove nothing was sent. |
| `job.failed`, `email_origin_mismatch` | The queued action URL differs from the configured origin, for example after a domain change. Confirm the canonical `AUTH_BASE_URL` and request a new link on that origin; do not rewrite queued tokens. |
| `job.failed`, `delivery_requires_reconciliation` | A prior attempt already has a rejected/uncertain durable record. Subsequent processing does not blindly resend it. Review the original `notification.delivery` event and Brevo activity. |
| `job.failed`, `database_permission_denied` / `database_schema_missing` | Check worker runtime grants or the selected database's migrations; the job may have failed before contacting Brevo. |

Brevo can reject API requests with HTTP 401 and an explicit **unrecognised IP** message.
Review [Brevo authorised IPs](https://app.brevo.com/security/authorised_ips) and authorise
only the outbound addresses for the service that sends email. Render and this development
environment have different outbound addresses; authorising one does not authorise the other.
Use Render's listed outbound addresses for the appropriate service/region. Do not use your
phone's IP, the website's inbound address, or disable all restrictions as a shortcut.
An observed development egress IP may change. Confirm the current address before authorising.
After correcting provider access, request one fresh verification link and follow its
reference; do not erase or blindly replay old rejected/uncertain delivery records.

The recovery page previously showed a hard-coded development notification-sink statement
even with Brevo enabled. That text was not a configuration reading. The corrected page
acknowledges recovery requests without claiming delivery and displays a support reference.
Actual provider selection is shown by `worker.started` and the readiness/service diagnostics.

`job.failed` now includes the job kind. Before this diagnostic update, `handler_failed`
did not identify why Brevo failed; historic failures cannot recover a discarded HTTP
response. New provider attempts log only job ID, outcome, HTTP status and fixed labels.
No raw response bodies, addresses, message IDs, keys or action URLs are logged. Do not
delete delivery records or bypass verification to make an account accessible. After
correcting a confirmed rejection, request one fresh verification link, then use the
newest email. Resends remain subject to both local and provider limits.

The production health contract now requires migration 024, preventing an older schema
from being mistaken for a compatible one. Bootstrap does not perform migrations itself.
If you cannot run a separate migration command, use the explicit Docker entry option below.

## Phone-only Render upgrade, without Shell

This fallback is for the Docker deployment using `deploy/Dockerfile` and its normal `web`
command. It is disabled by default and does not apply to the local `npm run start` launcher.
It does not require a terminal, a new service, or an HTTP migration endpoint.

1. Confirm the web service uses the correct Aiven `DATABASE_URL`. Its database role must
   own the application's schema or otherwise have the necessary migration permissions.
   A restricted web role cannot perform this step; do not grant broad permissions blindly.
   Preserve a backup of existing important data before upgrading. The migration runner
   applies pending checked-in SQL; it does not run development reset or seed commands.
2. In Render on your phone, open the **web service → Environment** and add:

   ```dotenv
   LONDOS_MIGRATE_ON_START=true
   ```

3. Keep the existing database, authentication and Brevo settings, plus the valid bootstrap
   account settings if you need those accounts created. Save and deploy the commit that
   includes this option, or use **Manual Deploy → Deploy latest commit**. Keep the normal
   Docker command `web`; no custom shell command is needed.
4. Startup runs the migrator first, then optional account bootstrap, then the web server.
   Look for `{"event":"release.migration","result":"passed"}`, followed by
   `bootstrap.complete` if bootstrap is configured. A migration failure prevents both
   bootstrap and web startup. Do not use a missing flag or remove safeguards to bypass it.
5. After success, set `LONDOS_MIGRATE_ON_START=false` (or remove it). Remove the bootstrap
   account keys after `bootstrap.complete`, then save/redeploy. Accounts and database data
   remain. Use the worker for verification email, then verify the accounts and enrol MFA.

The existing advisory lock prevents simultaneous migrators; checksums prevent modified
historical migrations from being silently reapplied. Repeated starts skip completed SQL.
Each migration is transactional, but the entire sequence is not one transaction: earlier
successful migrations remain if a later one fails. This option is not a backup or rollback.
It uses `DATABASE_URL` and the configured CA, with no additional credential defaults.
Worker starts never run migrations, even if the flag was copied into their environment.
Use separately controlled migrations for later planned releases; leaving this flag on
would authorize pending migrations at every future web restart.

## Create the first landlord and a separate shopkeeper

In the **web service's private Render Environment settings**, add the keys below with your
own values. Use two different email addresses and two different strong passwords. To
create only one role, omit all three keys for the other role.

```dotenv
LONDOS_BOOTSTRAP_ADMIN_NAME=Your administrator name
LONDOS_BOOTSTRAP_ADMIN_EMAIL=your-monitored-admin-address
LONDOS_BOOTSTRAP_ADMIN_PASSWORD=your-private-unique-password
LONDOS_BOOTSTRAP_SHOPKEEPER_NAME=Your merchant name
LONDOS_BOOTSTRAP_SHOPKEEPER_EMAIL=your-separate-monitored-merchant-address
LONDOS_BOOTSTRAP_SHOPKEEPER_PASSWORD=another-private-unique-password
```

The values above describe what to enter; they are not usable credentials. Passwords must
be 20–128 characters. They stay server-side and are hashed using the pinned Better Auth
password implementation. You may also use the supported `_PASSWORD_FILE` secret-file
settings with the release entry. Never put these keys in `NEXT_PUBLIC_*`, a URL, a chat,
a repository file or a screenshot.

On the next web start, the production entry (or `npm run start` locally) provisions each
requested account once. An explicit run is also available as `node release-entry.mjs bootstrap`
in the image, or `node dist/bootstrap.mjs` in a built checkout with private env settings.
There is no public bootstrap endpoint. Startup logs show only `bootstrap.complete` and
the number created, never passwords, email addresses or verification tokens.

After successful provisioning:

1. Remove all bootstrap keys from Render and restart. The accounts remain in PostgreSQL.
   The web child process does not inherit bootstrap secrets even on the provisioning run.
2. Open the email verification links. If a link expires, enter your email on the sign-in
   page and use **Resend verification email**. An unverified account cannot sign in.
3. Landlord: open `/sign-in?next=/landlord`, sign in, open Account security, enable and
   verify your authenticator, keep backup codes privately, then open `/landlord`.
4. Shopkeeper: open `/shopkeeper` and sign in. This role receives a new merchant and one
   **empty unpublished shop** with explicit initial owner-granted active tenancy. It is
   not a payment, paid invoice, demonstration account, or automatically renewed subscription.
   Its generated unique shop address is visible in the workspace. Add your own catalogue,
   contacts and design, then publish deliberately. Manual hosted rent lifecycle is still a
   separate incomplete feature; do not interpret this initial access as a completed rental contract.
5. Set `LONDOS_SUPPORT_EMAIL` to a monitored public contact address for policy enquiries.

Bootstrap refuses to take over an existing email address. It also refuses to create the
first landlord if any operator already exists; use account recovery for that operator.
There is one immutable receipt per role, so subsequent starts cannot change the account,
reset a password, recreate a deleted identity, or reinstate revoked grants. Changing an
email variable after a receipt exists does not create another user. To add more operators,
use a separately reviewed provisioning procedure; do not delete the receipt.

## Registration and search failures

An empty catalogue returns **No shops matched this search**. **Search is temporarily
unavailable** means a query failed, not that there are no shops. The page now shows a
support reference; match it to a `discovery.failed` event in private server logs.
Registration failures show a request reference matched to `registration.failed`.
Neither logger records raw exceptions, connection strings, SQL parameters or form data.

| Safe category or response | Check |
| --- | --- |
| `database_schema_missing` / `database_schema_outdated` | Correct database selected; all checked-in migrations applied with the migrator. |
| `database_permission_denied` | Runtime role grants include the new tables. |
| `database_connection_limit` | Small web/worker pools and provider connection usage; do not create more pools blindly. |
| `database_unreachable`, DNS/timeout/TLS category | Provider availability, actual port, network access and trusted public CA; preserve certificate verification. |
| `email_configuration_invalid` | `LONDOS_EMAIL_PROVIDER=brevo`, API key, sender email/name; use the exact variable names. |
| HTTP 422 | Name, valid email, 12–128-character registration password, confirmation and terms checkbox. Whitespace around email is trimmed. |
| HTTP 429 | Wait for the rate-limit window; repeated registration is intentionally limited. |
| HTTP 403 | Canonical `AUTH_BASE_URL` and accepted request origin; use the main website address. |
| HTTP 202 but no email | Worker heartbeat, sender verification, Brevo quota and delivery jobs. Acceptance means queued/handled, not inbox delivery. |
| `service_unavailable` | Use the reference with private server diagnostics; the public response deliberately contains no driver details. |

The owner-facing Service configuration page now warns if no worker has a recent heartbeat.
A hosted configuration was tested with a disposable database and fictional Brevo settings;
no live mail was sent, and this does not identify the cause of an uninspected Render failure.

## Reports, privacy and policies

Hosted shop report intake, private attachments, scoped moderator review, status updates and
appeals now use the existing trust implementation. Origin validation, queue limits, retry
capabilities, scoped MFA, conflict checks and independent reversal rules still apply.
The initial landlord can review cases, but an independent second reviewer is needed where
existing safeguards require one; one account cannot bypass independent review.

Shop owners can use Business data and privacy to download bounded business sections and
request manual review. Assigned privacy operators may hold/release, deny or complete a
manual review with an explanation. Manual completion explicitly says it did not delete data.
Automatic hosted erasure remains disabled, including if `LONDOS_PRIVACY_ERASURE=true`.
This does not represent a complete legal subject-access export or delete external copies.

`/privacy` and `/terms` are readable on the same site. Registration requires acceptance and
records the current policy version for successfully created identities. Links open separately
so form entries remain intact. These are drafted service terms reflecting implemented behavior;
the owner must verify the operator/contact details, applicable legal obligations and actual
retention/processor arrangements before treating them as legal sign-off.

Verification and complete file list: [hosted feedback evidence](evidence/HOSTED-FEEDBACK-2026-10-22.md).
