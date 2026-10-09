# Cross-platform clients and shared-server deployment

## Supported topology

Londos remains a modular monolith with one authoritative HTTPS origin. This preserves the existing
same-origin authentication cookies, server-rendered pages, tenant authorization and MFA controls.

```text
Customer PWA ───────┐
Shopkeeper PWA ─────┼── HTTPS ── Londos web/API ── PostgreSQL (canonical)
Management PWA ─────┘                    │
                                        └── Londos worker ── Brevo/providers
```

The landlord/superadmin configures environment variables only on the server and worker. Browser and
PWA clients receive public responses and call the existing same-origin APIs; they never receive
database credentials, `AUTH_SECRET`, Brevo keys, AI keys, MongoDB credentials, or Cloudinary
credentials. PostgreSQL remains the one canonical database. MongoDB/Cloudinary remain optional public
copies and Redis remains optional, under the existing guarded configuration.

The Londos web/API is the **gateway**. A customer, merchant or operator must never connect directly
to PostgreSQL or MongoDB. Every private request first reaches the API, which authenticates the
session, applies origin/CSRF controls, checks the precise role, shop/merchant scope and MFA/freshness
requirements, and only then performs a bounded database operation. Database network rules should
allow the web, worker and separately authorized migration/backup hosts—not end-user devices.

The three experiences can look and install like separate applications without being three copies of
the trusted server:

| Experience               | Entry point   | Server boundary                                                              |
| ------------------------ | ------------- | ---------------------------------------------------------------------------- |
| Public mall/customer PWA | `/`           | Only published, currently eligible public fields and public actions          |
| Shopkeeper PWA           | `/shopkeeper` | Authenticated merchant membership plus per-shop permissions                  |
| Landlord/management PWA  | `/landlord`   | Explicit operator grants, native MFA and fresh authentication where required |

Knowing or typing another entry-point URL grants nothing. The server authorization checks—not a
hidden menu, launcher name or separate hostname—are the security boundary.

## Why the three user surfaces are not separate static sites

Mall, Shopkeeper and Landlord are route and authorization boundaries in one Next.js server. The two
private surfaces use dynamic server rendering, secure cookies, direct server-side authorization and
same-origin APIs, so they cannot be exported as static sites. Deploying three copies would also need
three sets of server secrets and would complicate session origins without creating a security
boundary. Role checks already happen on the server; a different launcher or PWA icon does not grant a
role.

Use one web/API deployment and give people its role-specific address:

- customers: `https://YOUR_HOST/`;
- merchants/staff: `https://YOUR_HOST/shopkeeper`;
- scoped operators: `https://YOUR_HOST/landlord`.

Three independently hosted frontends are a possible later architecture only after creating a
versioned central API, cross-origin policy, client authentication/token design, surface-specific
builds and equivalent tenant/MFA tests. Even then, all database access stays behind the central API.
Do not point static-site JavaScript or a desktop/PWA client at a database connection string.

## Database modes are not a runtime toggle

The current protected implementation uses PostgreSQL transactions, constraints, advisory/row locks,
native authentication tables, durable queues and 21 ordered migrations across 68 SQL-dependent
source files. `LONDOS_DATABASE_ENGINE=postgresql` therefore remains mandatory. MongoDB currently
holds only explicitly copied public catalogue documents; Cloudinary holds the corresponding
normalized public media when that copy workflow is enabled.

Changing a flag cannot safely make MongoDB authoritative. A MongoDB-primary edition would require a
new persistence implementation for every protected workflow, an approved data model/migration,
transaction and concurrency equivalents, authorization/recovery tests and a cutover/rollback plan.
Until that work exists, a MongoDB-only Render service is a preview/read-model experiment—not Londos
accounts, shops, rent, audit or administration.

Likewise, copying MongoDB records into PostgreSQL periodically is a migration/ETL operation, not a
backup. Keep one authority at a time. Back up that authority on a schedule and test restoration;
never switch databases automatically because a byte threshold or number of days was reached.

## Render files

| File                                                    | Purpose                                                                   | Cost/limits                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`render.yaml`](../render.yaml)                         | Root one-click Blueprint for fictional public browsing                    | Render free web tier; sleeps/ephemeral; no accounts, database or worker |
| [`deploy/render.web.yaml`](../deploy/render.web.yaml)   | Full web/API service connected to an existing reachable PostgreSQL/worker | Web can use free tier for evaluation; not a complete free deployment    |
| [`deploy/render.full.yaml`](../deploy/render.full.yaml) | Review template for web plus independent worker                           | Worker uses `starter`; PostgreSQL is supplied separately                |

Automatic deploy is off in every template. The operator must select the exact reviewed branch/commit,
set secrets in Render's environment UI, apply migrations with a separate privileged migrator, and
verify `/api/ready`. Do not paste secrets into YAML or source files. `AUTH_BASE_URL` must be the exact
HTTPS web origin and both runtime services use the same canonical PostgreSQL data.

Render's free web service is suitable for the fixture demonstration. It is not an always-on worker,
durable database, key store, upload store, or backup system. The full account/shop/landlord service
therefore cannot honestly be described as an all-free Render deployment. An owned supervised machine
may run the worker and PostgreSQL, or reviewed paid/managed services may do so.

## Owned server

Use `INSTALL-WINDOWS.bat`, `install-macos.command`, or `install-linux.sh` for a loopback development
installation. Publishing an owned machine to other people is a separate server operation: use a real
domain and TLS, protect PostgreSQL from the public Internet, set `LONDOS_LOCAL_ADAPTERS=false`, supply
a verified Brevo configuration, run the web and worker under process supervision, overwrite untrusted
client-IP headers at the ingress, and implement backups/recovery. The local one-click installer does
not weaken its loopback protections to turn a development computer into an Internet server.

Follow [Render setup](RENDER-SETUP.md), [deployment profiles](DEPLOYMENT-PROFILES.md), and the
[release runbook](RELEASE-RUNBOOK.md) before exposing real accounts. The current G5/live policy gates
remain applicable.

For an owned mini PC, `AUTH_BASE_URL` is the one stable public HTTPS origin, for example
`https://mall.example`. Buying a domain is optional if a reviewed tunnel/hosting provider supplies a
stable hostname, but a changing LAN address is not a usable remote authentication origin. The public
hostname terminates TLS at a reviewed reverse proxy or protected tunnel and forwards HTTP to the
Londos web process. It must **not** forward PostgreSQL's port. The web/API and worker then access
PostgreSQL over loopback or a private network.

Render cannot reach `127.0.0.1` on the mini PC. A hybrid deployment therefore exposes the Londos API
through protected HTTPS, or connects server-to-server over a reviewed private network; it never
publishes PostgreSQL itself. The mini PC becomes a real production dependency and needs process
supervision, automatic restart, SSD monitoring, independent encrypted backups, recovery tests,
router/firewall maintenance, reliable power and sufficient upload capacity. Start locally first,
then complete those controls before allowing remote users.

## Installing the client

From the deployed HTTPS origin, open `/install`. Supported browsers can install Londos as a PWA on
Android and desktop operating systems. Open `/shopkeeper` or `/landlord` before invoking the browser's
Install command when a role-specific name and start page are desired. iPhone/iPad users can use Share
→ Add to Home Screen, though this branch targets the user's requested Android/desktop clients.

The app requires the server to be reachable. Its service worker performs lifecycle registration only;
it does not cache sensitive responses or claim offline private operation.
