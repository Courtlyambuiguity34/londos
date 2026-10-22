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
   `worker: ready`. A free web service is not an always-on worker.

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
2. Open the email verification links. If a link expires, use the verification resend
   action on registration. An unverified account cannot sign in.
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
