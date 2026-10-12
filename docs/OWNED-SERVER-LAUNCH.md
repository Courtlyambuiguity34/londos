# Launching Londos from an owned Windows server

This is the operator path from the working `D:\Londos` installation to an Internet-facing Londos
release. It does not turn the development START shortcut into a production server. Production uses
the compiled build, a dedicated unprivileged account, the self-hosted web/worker entry points,
localhost-only PostgreSQL and Cloudflare Tunnel.

## Before buying the domain

Choose a short domain you control and can renew. Namecheap can remain the registrar; Cloudflare will
manage authoritative DNS and the tunnel. Start with one canonical hostname such as
`app.yourdomain.example`. The public Mall, Shopkeeper and Landlord are already separate protected
paths on one Londos application (`/`, `/shopkeeper`, `/landlord`); they do not connect directly to
PostgreSQL.

Do not declare the server production-ready until all of these are true:

- the server has a dedicated non-administrator Londos account, full-disk encryption, automatic
  security updates, a UPS and monitored Internet/power availability;
- the web and worker start on boot and `/api/ready` reports database, authentication and worker
  ready;
- PostgreSQL listens on loopback only, nightly encrypted backups leave the machine, and a restore
  has been tested on an isolated database;
- the domain and named Cloudflare Tunnel work over HTTPS, while ports 3000 and 5432 remain closed on
  the router and public firewall;
- Landlord has Cloudflare Access plus Londos MFA, and tenant-isolation/release checks pass against
  the exact release;
- the Brevo sender/domain is verified, secrets are in the private service environment, and email
  limits, privacy/retention, rent, recovery and incident policies are approved.

The current repository still records these live conditions as open. A successful local demo is not
evidence that power, backup restoration, a real email sender or production policy is ready.

## Package the Windows start buttons

`INSTALL-WINDOWS.bat` now builds six small executables in `Londos-Launchers` after the application
install succeeds. To rebuild them without reinstalling anything, double-click
`BUILD-WINDOWS-LAUNCHERS.bat`.

| Executable                  | Reviewed launcher it invokes           |
| --------------------------- | -------------------------------------- |
| `Londos Mall.exe`           | `START-WINDOWS.bat`                    |
| `Londos Shopkeeper.exe`     | `START-SHOPKEEPER-WINDOWS.bat`         |
| `Londos Landlord.exe`       | `START-LANDLORD-WINDOWS.bat`           |
| `Londos Preview.exe`        | `START-PREVIEW-WINDOWS.bat`            |
| `Londos Temporary Demo.exe` | `START-TEMPORARY-DEMO-WINDOWS.bat`     |
| `Stop Londos.exe`           | `STOP-WINDOWS.bat`                     |

These are thin convenience launchers, not a second copy of Londos. Keep the `Londos-Launchers`
folder inside `D:\Londos`; the executables search upward for `package.json` and their BAT target.
The generated files are ignored by Git. They are locally compiled and unsigned, so Windows may show
an unknown-publisher warning. Before distributing them to other people, buy an organization
code-signing certificate, sign each executable with `signtool`, and timestamp the signature. Never
train users to ignore SmartScreen for an unsigned public release.

The local Mall/Shopkeeper/Landlord executables share one server and database. Starting a second role
opens its protected route instead of starting another server. For unattended production, use the
Task Scheduler web and worker tasks in [the self-hosted runbook](../deploy/selfhosted/README.md), not
an interactive `.exe` window.

## Get a temporary link from the Windows PC

Double-click `START-TEMPORARY-DEMO-WINDOWS.bat` or `Londos Temporary Demo.exe`, then enter the one
visitor email address that should be allowed. The launcher:

1. refuses to share port 3000 if the full database-backed Londos core is running;
2. starts only the fictional, database-free preview;
3. downloads Cloudflare's pinned Windows x64 `cloudflared` release into `core\runtime`, verifies its
   SHA-256 digest, and rejects a changed binary;
4. prints a random `https://...trycloudflare.com` address and requires the named visitor email.

Copy that printed address to the visitor. Keep both windows open; `Ctrl+C` in the tunnel window
closes the external link. The address changes every run. It cannot be created from this repository's
cloud build on behalf of your PC because only the process running on your PC can reach its local
preview.

Quick Tunnels are for demonstrations only: Cloudflare gives no uptime guarantee, limits them to 200
in-flight requests, and does not support Server-Sent Events. They must not expose the database-backed
core, Landlord, customer data or real credentials. The implementation follows Cloudflare's
[official Quick Tunnel guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/),
checked **2026-10-12**. If a machine-level Cloudflare configuration conflicts with Quick Tunnels,
use the named production tunnel below instead of weakening that configuration.

## Connect a purchased domain

### 1. Move DNS management safely

1. Add the purchased domain to Cloudflare and inspect the imported DNS records.
2. Before changing nameservers, manually recreate every record used by email or another service:
   Namecheap Private Email MX records, SPF, DKIM, DMARC, verification TXT records and any existing
   A/AAAA/CNAME records. Email records normally remain **DNS only**, not proxied.
3. If DNSSEC is enabled at Namecheap, follow Cloudflare's DNSSEC migration steps before changing
   nameservers. An incorrect DS record can make the entire domain unreachable.
4. In Namecheap, replace the current nameservers with the two assigned by Cloudflare. Wait until the
   Cloudflare zone says **Active**, test mail send/receive, and re-enable DNSSEC as Cloudflare
   instructs.

Cloudflare's [full-zone setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
and [DNS records guide](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)
were checked **2026-10-12**. The registrar account, Cloudflare account and domain-renewal mailbox
should all use MFA and recovery details owned by the business.

### 2. Configure the production environment

Copy `deploy/selfhosted/.env.selfhosted.example` to a protected file such as
`C:\ProgramData\Londos\londos.env`. Do not commit it. At minimum set:

```dotenv
DEPLOY_MODE=selfhosted
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://londos_app:PRIVATE_PASSWORD@127.0.0.1:54330/londos?sslmode=disable
AUTH_SECRET=GENERATE_AT_LEAST_32_RANDOM_CHARACTERS
AUTH_BASE_URL=https://app.your-real-domain.example
LONDOS_PWA_ORIGINS=https://app.your-real-domain.example
LONDOS_CORE_ENABLED=true
LONDOS_DATA_SOURCE=database
LONDOS_DATABASE_ENGINE=postgresql
LONDOS_MONGODB_ENABLED=false
LONDOS_REDIS_ENABLED=false
```

Use the actual contained PostgreSQL port saved by the installer rather than assuming `54330`.
Configure the verified Brevo sender and API key only in this private file when live email is approved.
Leave MongoDB, Redis and Cloudinary disabled unless their separately documented use is deliberately
enabled. PostgreSQL remains authoritative.

### 3. Create the stable Cloudflare Tunnel

Install the current official `cloudflared` release and run these commands from the dedicated server
operator account:

```powershell
cloudflared tunnel login
cloudflared tunnel create londos-web
cloudflared tunnel route dns londos-web app.your-real-domain.example
cloudflared tunnel list
```

Create the protected Cloudflare config using the tunnel UUID and generated credential file:

```yaml
tunnel: REPLACE_WITH_TUNNEL_UUID
credentials-file: C:\ProgramData\cloudflared\REPLACE_WITH_TUNNEL_UUID.json
ingress:
  - hostname: app.your-real-domain.example
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Validate and test it in the foreground before installing it as a service:

```powershell
cloudflared tunnel ingress validate
cloudflared tunnel --config C:\ProgramData\cloudflared\config.yml run londos-web
```

Then follow Cloudflare's current
[Windows service instructions](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/).
The stable service must use that exact protected config and start on boot. Do not forward router
ports 3000 or 5432, and never add PostgreSQL, Remote Desktop, file shares or backup folders to the
tunnel.

### 4. Protect operator access

In Cloudflare Zero Trust, create a self-hosted Access application for
`app.your-real-domain.example/landlord/*`. Allow only named operator identities and require MFA.
Do not add a public bypass policy. Cloudflare Access is an outer gate; Londos sessions, native MFA,
operator grants, tenant scoping and audit logs must remain enabled. If path policy is unavailable in
the selected plan, use `admin.your-real-domain.example` routed to the same loopback service and put
that entire hostname behind Access.

The public Mall and Shopkeeper still reach Londos through HTTPS and server-side authorization. They
never receive `DATABASE_URL`, PostgreSQL credentials or direct database network access.

## Move from fictional demo data to real shops

Development data and real production onboarding are deliberately different:

1. For a disposable local demonstration, run `npm run db:demonstration` only against the guarded
   local database. Its 12 merchant accounts and their credentials stay in the ignored
   `.local/demonstration-accounts.json` file.
2. Sign in as a fictional shop owner, open **Shopkeeper → shop → Manage catalogue and contacts**, and
   replace sample product names, prices and descriptions. Upload only photos you own or are licensed
   to publish, add useful alt text, wait for media processing, preview, and explicitly publish.
3. After the demonstration, an MFA-authenticated operations operator can remove the marked demo
   accounts from **Landlord → Demonstration accounts**. Historical business/audit records are
   retained by design.
4. On the live database, do **not** run `db:seed` or `db:demonstration`. Real shopkeepers register
   with their own email, verify through the configured Brevo flow, submit an application, and are
   reviewed/provisioned by an authorized Landlord operator. The shopkeeper then uploads the real
   catalogue through the same tenant-scoped workspace.
5. Before publishing a real shop, confirm consent/licensing for every image, the correct merchant
   contact and payment instructions, stock/availability, privacy notice, rent state and moderation
   status. Preview the public URL, then publish explicitly.

There is intentionally no SQL file that fabricates real users, bypasses email verification, or
scrapes product images from the Internet. The current safe import method is the authenticated
Shopkeeper UI. A future bulk importer must use the same authorization, validation, media processing,
audit and publication boundaries; a direct database importer is not an acceptable shortcut.

## Final cutover

1. Stop the interactive development launchers.
2. Run the repository checks and production build for the exact commit being deployed.
3. Run migrations once under the authorized migration account.
4. Register and start separate unprivileged Task Scheduler jobs for
   `deploy\selfhosted\start-production.ps1 -Role web` and `-Role worker`.
5. Confirm `http://127.0.0.1:3000/api/ready`, then the HTTPS hostname, Mall browsing, merchant
   tenant isolation, Landlord MFA/permissions, email verification/recovery and media upload.
6. Start the named tunnel service, enable monitoring and the off-machine nightly backup task.
7. Complete and retain a restore test, security/release report and rollback decision before inviting
   real merchants.

The exact Task Scheduler, PostgreSQL, migration, backup and rollback commands are maintained in the
[self-hosted deployment runbook](../deploy/selfhosted/README.md).
