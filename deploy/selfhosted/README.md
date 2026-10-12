# Londos optional self-hosted mode

For the Windows domain-purchase sequence, packaged local launch buttons, protected temporary demo
link, real-shop onboarding boundary and final cutover checklist, start with the
[owned-server launch guide](../../docs/OWNED-SERVER-LAUNCH.md). This runbook remains the detailed
source for service supervision, PostgreSQL migration, backups and rollback.

This folder is additive. Render with hosted PostgreSQL remains the default (`DEPLOY_MODE=render`).
Self-hosting is selected only through environment values:

```dotenv
DEPLOY_MODE=selfhosted
DATABASE_URL=postgresql://londos_app:REPLACE@127.0.0.1:5432/londos
```

PostgreSQL remains the only source of truth. MongoDB, when explicitly enabled, is a bounded,
read-only public catalogue copy; it is not a write path or failover database. Cloudflare Tunnel
publishes the loopback web listener. PostgreSQL must never be exposed through the tunnel.

## 1. Prepare the machine

Use a dedicated, patched Windows or Linux machine with full-disk encryption, automatic security
updates, reliable power, an uninterruptible power supply, monitoring and a separate backup target.
Install the repository's supported Node.js/npm versions and PostgreSQL client/server tools. From the
repository root:

```bash
npm ci
npm run check
npm run build
node deploy/selfhosted/postgres-tools.mjs check-tools
```

Create a dedicated unprivileged operating-system account named `londos`. On Linux, place the release
at `/opt/londos/current`, owned by that account. On Windows, use a restricted local account and a
folder such as `C:\Londos\current`; do not run Londos as an administrator.

Copy `.env.selfhosted.example` to a private operator-managed file:

- Linux: `/etc/londos/londos.env`, owner `root:londos`, mode `0640`.
- Windows: `C:\ProgramData\Londos\londos.env`, readable only by Administrators and the Londos
  service account. Set `LONDOS_ENV_FILE` to that absolute path in each scheduled task.

Never copy the populated file into Git, a PWA, a screenshot or a support message.

## 2. Install localhost-only PostgreSQL

Install a currently supported PostgreSQL release from your operating system or the official
PostgreSQL packages. In `postgresql.conf`, set:

```conf
listen_addresses = 'localhost'
password_encryption = 'scram-sha-256'
```

In `pg_hba.conf`, retain local administration and allow only loopback SCRAM clients for Londos. Do
not add a public subnet:

```conf
local   all             postgres                                peer
host    londos          londos_app      127.0.0.1/32            scram-sha-256
host    londos          londos_app      ::1/128                 scram-sha-256
```

On Windows, use `scram-sha-256` for the local `postgres` administration entry instead of `peer`.
Restart PostgreSQL and verify its listener with `ss -ltnp` (Linux) or `Get-NetTCPConnection`
(PowerShell). Port 5432 must be bound only to loopback. Keep the OS firewall rule closed to every
remote source.

Create a non-superuser application role without putting its password in shell history:

```sql
-- Run in psql as the local postgres administrator.
CREATE ROLE londos_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
\password londos_app
CREATE DATABASE londos OWNER londos_app;
REVOKE ALL ON DATABASE londos FROM PUBLIC;
GRANT CONNECT ON DATABASE londos TO londos_app;
```

Set the private `DATABASE_URL`, run `npm run db:migrate`, then run the existing release verification.
Do not run development seed commands against a live database.

## 3. Run production web and worker processes

The entry point refuses any mode other than `selfhosted`, refuses a non-loopback PostgreSQL URL,
requires the compiled standalone build, and never starts a development server.

```bash
LONDOS_ENV_FILE=/etc/londos/londos.env deploy/selfhosted/start-production.sh web
LONDOS_ENV_FILE=/etc/londos/londos.env deploy/selfhosted/start-production.sh worker
```

The web process binds to `127.0.0.1:$PORT`. Verify locally:

```bash
curl --fail http://127.0.0.1:3000/api/ready
```

Readiness must report `ready:true`, database/authentication true, and worker `ready` before traffic is
flipped.

The worker also expands campaigns, prepares opted-in monthly reports and drains Brevo notifications.
For live email set the verified Brevo sender/key and conservative hourly/daily limits in the private
service environment. Keep `LONDOS_MONTHLY_REPORTS_ENABLED=false` until analytics/privacy and live
delivery are approved. See [communications and manual billing](../../docs/COMMUNICATIONS-AND-MANUAL-BILLING.md).

### Linux systemd

1. Review the paths and hardening directives in `systemd/*.service`.
2. Copy the units to `/etc/systemd/system/`.
3. Create `.local` and `.next/cache` under the release and grant them to `londos`.
4. Run `sudo systemctl daemon-reload`.
5. Run `sudo systemctl enable --now londos-web londos-worker`.
6. Check `systemctl status londos-web londos-worker` and the readiness URL.

Do not remove `NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, the unprivileged account, or the
loopback listener merely to make startup easier.

### Windows Task Scheduler

Create two tasks using Task Scheduler's **Create Task** dialog—one named `Londos Web`, one named
`Londos Worker`:

1. **General**: use the dedicated Londos account, **Run whether user is logged on or not**, and do not
   select an administrator account.
2. **Triggers**: **At startup**, with a 30-second delay.
3. **Actions**: start `powershell.exe`. For web use
   `-NoProfile -ExecutionPolicy RemoteSigned -File "C:\Londos\current\deploy\selfhosted\start-production.ps1" -Role web`;
   for the worker change the last word to `worker`.
4. **Start in**: `C:\Londos\current`.
5. Add the account-scoped environment variables `LONDOS_ENV_FILE=C:\ProgramData\Londos\londos.env`
   and `DEPLOY_MODE=selfhosted` before registering the tasks.
6. **Settings**: restart every minute after failure, stop retrying after five attempts, and do not
   start a second instance.
7. Run both tasks manually once and verify `http://127.0.0.1:3000/api/ready`.

Native Task Scheduler is the supported Windows boot supervisor. Do not use `sc.exe create` directly
for Node—the process does not implement the Windows Service Control Manager protocol. A third-party
service wrapper requires its own security and update review.

## 4. Publish only the Londos web/API origin with Cloudflare Tunnel

The following official documentation was checked on 2026-10-09:

- [Install/download cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
- [Create a locally managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/)
- [Tunnel configuration file](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [Run cloudflared as a service](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/)
- [Move authoritative nameservers to Cloudflare](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

Namecheap remains the registrar; Cloudflare becomes authoritative DNS:

1. Add the domain to Cloudflare and carefully review the imported DNS zone.
2. Recreate every required Namecheap/private-mail record in Cloudflare before switching: MX, SPF,
   DKIM, DMARC, verification TXT, mail host and any other A/AAAA/CNAME records. Cloudflare warns its
   automatic scan can miss records. Mail records normally remain DNS-only.
3. If DNSSEC is active at Namecheap, follow Cloudflare's documented DNSSEC migration sequence. A
   blind nameserver change while DNSSEC is active can make the domain unreachable.
4. Replace the Namecheap nameservers with the two nameservers Cloudflare assigns, then wait for the
   zone to become active and re-enable DNSSEC through Cloudflare when instructed.

Install `cloudflared` from Cloudflare's current package/download page, then as the dedicated operator:

```bash
cloudflared tunnel login
cloudflared tunnel create londos-api
cloudflared tunnel list
cloudflared tunnel route dns londos-api api.example.com
```

Copy `cloudflared-config.yml.example` to cloudflared's protected configuration directory, substitute
the tunnel UUID, credential-file path and real API hostname, and validate it:

```bash
cloudflared tunnel ingress validate
cloudflared tunnel --config /etc/cloudflared/config.yml run londos-api
```

The final catch-all `http_status:404` rule is required. Never add PostgreSQL, SSH, admin desktops, a
file share or the backup path to this public tunnel.

On Linux, after the foreground check succeeds:

```bash
sudo cloudflared --config /etc/cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
systemctl status cloudflared
```

On Windows, follow Cloudflare's current Windows service guide. It uses an elevated command prompt,
`cloudflared.exe service install`, a protected system-profile `.cloudflared` directory, and an
explicit service `ImagePath` naming the config. Restart the service after configuration changes.

Set `AUTH_BASE_URL=https://api.example.com` when `api.example.com` is the chosen canonical Londos
web/API origin. A simpler first owned-server deployment may name that same origin `app.example.com`;
the hostname and environment value must match exactly. Set `LONDOS_PWA_ORIGINS` to the exact Mall,
Shopkeeper and Landlord PWA origins—at most three unique HTTPS origins. The API emits credentialed
CORS headers only for that allowlist and still rejects browser requests marked cross-site. Use
subdomains under the same registrable domain. Database URLs and secrets stay on the API/worker
machine only.

## 5. Protect Landlord with Cloudflare Access

Create a dedicated `admin.example.com` hostname routed to the same loopback service. In Cloudflare
Zero Trust, create a self-hosted Access application covering `admin.example.com/*`; allow only named
landlord/operator identities and require MFA. Do not make a bypass policy for the public Internet.
Cloudflare Access is an outer gate, not a replacement for Londos sessions, native MFA, operator
permissions, shop scopes or audit trails. Mall/customer and Shopkeeper hostnames must not inherit the
admin allow policy.

## 6. Move Aiven data to local PostgreSQL

Keep the Render/Aiven service live until the local copy is verified. Both URLs stay in environment
variables; the scripts suppress driver error output and never print either URL.

1. Schedule a maintenance window and stop Londos writes and the background worker.
2. Confirm the target is a new/approved local database. Take a separate target backup if it already
   contains any data.
3. Set `AIVEN_DATABASE_URL` to Aiven's TLS URI (`sslmode=require`, `verify-ca` or `verify-full`).
4. Export:

   ```bash
   deploy/selfhosted/export-aiven.sh
   # Windows:
   .\deploy\selfhosted\postgres-tools.ps1 -Action export-aiven
   ```

5. Set `DATABASE_URL` to the loopback target. Review the generated `.sha256` sidecar.
6. Restore only after explicit confirmation:

   ```bash
   export LONDOS_RESTORE_CONFIRM=restore-local
   deploy/selfhosted/restore-local.sh .local/backups/aiven-YYYY-MM-DDTHH-MM-SSZ.dump
   ```

   PowerShell uses `$env:LONDOS_RESTORE_CONFIRM="restore-local"` and
   `postgres-tools.ps1 -Action restore-local -Path <dump>`.

7. Run `npm run db:migrate`, `npm run check`, targeted integration/security tests, and the production
   readiness check against local PostgreSQL.
8. Compare critical row counts and manually test Mall browsing, Shopkeeper tenant boundaries and
   Landlord MFA/permissions.
9. Change only `DEPLOY_MODE=selfhosted`, `DATABASE_URL`, `AUTH_BASE_URL` and the approved origin/env
   values. Start the local web/worker, then route the API hostname through the tunnel.
10. Keep the Aiven service unchanged for the approved rollback window. If verification fails, stop
    local traffic and restore the previous Render environment/route; do not write independently to
    both databases.

There is no automatic dual-write, merge or MongoDB migration. PostgreSQL changes authority only at
the explicit traffic flip.

## 7. Nightly backups off the machine

Mount an encrypted external disk, NAS or remote/synchronized filesystem at the private path set in
`LONDOS_BACKUP_OFFSITE_DIR`. The script writes a custom-format dump and SHA-256 sidecar locally, then
copies both to that external path. It refuses relative paths and paths inside the checkout.

Test once:

```bash
deploy/selfhosted/nightly-backup.sh
pg_restore --list /mnt/londos-backups/londos-*.dump >/dev/null
```

For Linux, adjust `ReadWritePaths` in `londos-backup.service` if the mount differs, copy the backup
unit/timer, then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now londos-backup.timer
systemctl list-timers londos-backup.timer
```

For Windows, add a third Task Scheduler task that runs nightly with:

```text
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "C:\Londos\current\deploy\selfhosted\postgres-tools.ps1" -Action nightly-backup
```

An untested copy is not a backup. Perform periodic restores into an isolated database, record the
result and monitor both task failure and destination capacity. Decide and document retention before
deleting any dump.

## Security boundary checklist

- Only Cloudflare Tunnel reaches the loopback HTTP service; PostgreSQL remains loopback-only.
- CORS is an exact maximum-three origin allowlist. It is not authorization.
- Existing request budgets/rate limits, bounded-body parsing and strict Zod contracts stay enabled.
- Mall reads use public routes; Shopkeeper routes require merchant/shop membership; Landlord routes
  require native MFA and explicit operator grants/scopes. Cross-tenant misses return bounded
  unavailable responses rather than another tenant's data.
- Put the Landlord hostname behind Cloudflare Access and keep application MFA/authorization enabled.
- Secrets exist only in the private environment/service manager. No `.env`, dump, tunnel credential
  JSON or connection URI belongs in Git.
- Redis remains optional. Missing `REDIS_URL` must not block web or worker startup.
- MongoDB remains optional, manually refreshed and public-catalogue-only. Never point authentication,
  rent, privacy, audit or job writes at it.
