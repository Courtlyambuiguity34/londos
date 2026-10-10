# Local computer and optional services

The first installation uses **PostgreSQL on the owner's computer**. The owner explicitly asked to retain the existing PostgreSQL database and not migrate it. MongoDB, Redis and Cloudinary are optional, manually enabled services. Their credentials are absent in the current environment; no account, subscription or live integration has been invented.

Detailed first-time instructions: [local setup and usage](LOCAL-FIRST-SETUP.md), [Render setup](RENDER-SETUP.md), [offline Render checklist](../render.html), and [Cloudinary media linkage](CLOUDINARY-MEDIA.md).

## Working local installation

Use Linux or Ubuntu under WSL2 with Docker, Node 24.19.0 and npm 11.9.0. The verified environment uses these versions. Native Windows/macOS installation has not been independently tested.

```bash
npm ci --no-fund
npm run db:local
npm run db:migrate
npm run db:seed
npm run build
npm run start -- --port 3000
```

In a second terminal run `npm run worker`. Open `http://127.0.0.1:3000`. `/api/ready` must show `database=true`, `authentication=true`, and `worker=ready`; a fixture preview does not establish a working private database. Preserve `.env.local`, private `.local` account/delivery files and the PostgreSQL Docker volume. Do not put them in Git. Installation against an existing database verifies checksums and preserves edits; it does not replace the database.

The merged feature branch preserves migrations 001–018 byte-identically and both additive 019 migrations. Migration **020** verifies that the shop-designer intent column and release/demonstration delivery tables are present together. Seeded demonstration accounts use fictional `.invalid` addresses, random private passwords, unpublished shops and pending tenancies; they receive no operator permissions or rent credits. Their credentials are in ignored `.local/demonstration-accounts.json`, mode 600. `npm run db:demonstration` is repeatable and preserves edits/passwords; it never reactivates an account removed by an operator. It fails if an existing identity cannot be matched to its private account file.

In the Landlord workspace, an existing **operations** operator verifies fresh native MFA and opens **Demonstration accounts**. Removal disables authentication, rotates its authority epoch, deletes sessions, revokes staff memberships and archives its merchant's shops. It retains the legal owner membership and business/audit/financial records to preserve the last-owner and history invariants. Removal is not a claim of legal account erasure. Real accounts outside the explicit demonstration registry cannot be removed through this page. `npm run db:operations` is the existing guarded way to grant operations to the already seeded fictional review operator when needed; it does not create a new privileged user.

## Manual optional service configuration

| Variable                             | Current/default value | Effect                                                                                                                                   |
| ------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `LONDOS_DATABASE_ENGINE`             | `postgresql`          | Canonical account, rent, audit, catalogue and job data stay in PostgreSQL.                                                               |
| `LONDOS_MONGODB_ENABLED`             | `false`               | Enables explicit MongoDB connection and public-copy commands.                                                                            |
| `LONDOS_MONGODB_MIGRATION_ENABLED`   | `false`               | Must remain false. A true value fails closed; no canonical migration is implemented or authorized.                                       |
| `MONGODB_URL` / legacy `MONGODB_URI` | Absent secret         | MongoDB URI, including a dedicated copy database. Prefer a limited database user and verified TLS for remote connections.                |
| `LONDOS_CLOUDINARY_ENABLED`          | `false`               | Enables Cloudinary checks and normalized public image copies. Required for public catalogue-with-image copies; not MongoDB verification. |
| `CLOUDINARY_URL`                     | Absent secret         | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`, stored securely.                                                                           |
| `LONDOS_REDIS_ENABLED`               | `false`               | Enables the explicit Redis connection check.                                                                                             |
| `REDIS_URL`                          | Absent secret         | `rediss://USER:PASSWORD@HOST:PORT` for a remote service; loopback Redis may use `redis://`.                                              |

Flags accept only literal `true` or `false`. Disabled services need no credentials and make no external calls. Explicit process variables override `.env.local`; restart commands after changes. Application requests continue using PostgreSQL even if the optional flags are true. SQLite is not a supported interchangeable backend for the current PostgreSQL constraints, locking, search and recovery contracts.

```bash
# After setting the chosen optional flags and credentials securely:
npm run services -- check
npm run services -- copy SHOP_UUID --confirm-public-copy
npm run services -- read SHOP_UUID
```

`check` performs MongoDB ping, Redis ping and read-only Cloudinary usage checks for enabled services. `copy` accepts 1–20 explicit shop UUIDs, only currently eligible shops with a published design, at most 50 departments/1,000 products/100 managed ready images per shop. A coherent read-only PostgreSQL snapshot supplies allowlisted public fields. Only normalized managed public WebP images go to a fixed Cloudinary HTTPS upload endpoint; no private evidence, enquiries, accounts, finance or audit data is exported. MongoDB stores public metadata and Cloudinary links rather than image bytes. One document per shop is replaced atomically; a failure across several shops can leave a partial batch and the safe command can be rerun. Failed image uploads may leave an orphan public copy requiring operator cleanup.

`read` checks current PostgreSQL eligibility before inspecting a copy. These are manually refreshed snapshots; they are **not live application rendering, full database substitution, automatic failover or a migration**. External public copies and CDN retention need a removal/retention policy before real use; the primary application cannot recall previously copied/downloaded data. Redis's connection is implemented and locally verified, but application caches and durable jobs are not silently moved to it. A future canonical MongoDB switch needs a separate verified data/authorization/financial/recovery implementation and an approved migration plan. Toggling a flag cannot bypass that gate.

## Brevo email

The configured proposed sender is **mnelsontravor@gmail.com**, with name **Londos**. Set `LONDOS_EMAIL_PROVIDER=brevo`, `LONDOS_EMAIL_FROM`, `LONDOS_EMAIL_FROM_NAME`, and the **secret** `LONDOS_BREVO_API_KEY`. Brevo must verify the sender; a future purchased mailbox/domain needs its own sender and DNS authentication. A configured Gmail address alone is not proof of sender acceptance, domain authentication or inbox delivery.

Set `LONDOS_EMAIL_MAX_PER_HOUR` and `LONDOS_EMAIL_MAX_PER_DAY` at or below the actual limits of the
selected plan. The conservative templates use 250 for both. Brevo's official [Free plan limits
FAQ](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
was checked on **2026-10-10** and stated **300 email sends per day**, not 300 per hour. Limits can
change, so confirm the provider page before deployment. Londos atomically reserves both quota
windows in PostgreSQL and defers excess jobs to the next window without consuming their retry
budget. Other Brevo/API traffic still counts at the provider; leave headroom.

```bash
npm run email:verify
```

This sends no email: it checks the fixed Brevo account/senders endpoints and reports booleans without account identity, key values or provider error bodies. A missing key fails closed. Local adapters always keep notifications in the private local sink, even when Brevo settings exist. Remote authentication/worker startup requires configured Brevo instead of a local sink; core readiness reports configuration, not deliverability certification. Shopkeeper registration creates an unverified account and sends the native single-use verification link; it never creates operator grants. Password recovery uses the same native expiring-token contract. `LONDOS_MONTHLY_REPORTS_ENABLED=false` remains the default until analytics/privacy policy and live delivery are approved.

Migration 019 records one durable Brevo attempt per existing `notification.local` job identity; keeping that kind preserves old queued jobs. Payload identity and current worker lease are checked before an attempt. Accepted receipts survive acknowledgement loss, so retries cannot resend. Timeout, connection loss, malformed responses, HTTP errors and an interrupted `attempting` record require reconciliation and cannot be replayed into another send. The provider's own idempotency header is additional protection, not a claim of unlimited provider deduplication. This conservative policy can miss a notification after a crash before network transmission. Verify provider history, keep the original receipt, and explicitly regenerate a fresh action (for example request a new password reset) when appropriate. Do not reset/delete an attempt record. Aggregate monitoring raises `email_delivery_requires_reconciliation`; no payload or token appears in that alert. See [the runbook](RELEASE-RUNBOOK.md).

## Computer as a public server

First complete the local installation and [G5 launch manifest](launch/G5-DECISIONS.json). Public access needs an owned hostname, real TLS, a reviewed ingress that overwrites `x-londos-client-ip`, separate least-privilege database credentials, the independent supervised worker, live email validation, independent encrypted backups/current privacy authority/key recovery, responder ownership, approved policies and final launch review. Keep PostgreSQL off the public Internet. The existing [staging Compose](../deploy/compose.staging.yaml) and [TLS ingress](../deploy/nginx.staging.conf) demonstrate process separation and private-cache protection; they still use loopback development settings and are not an automatically authorized Internet deployment. Read [the release runbook](RELEASE-RUNBOOK.md) before adapting them. No domain/DNS change, paid purchase or production exposure occurred in this task.

## Render free web preparation

[render.web.yaml](../deploy/render.web.yaml) is a review-only blueprint for the existing Docker web artifact with automatic deployment off. Supply the real HTTPS origin, Brevo secret and a **reachable PostgreSQL** URL with verified TLS; Render cannot reach `127.0.0.1` on the owner's computer. Use managed PostgreSQL or a deliberately configured protected route to that computer. MongoDB's optional copy does not replace this requirement.

The blueprint does not create a paid worker or database. A separately supervised worker is required; a free web service's sleeping/ephemeral behavior is not durable scheduler, background worker or backup infrastructure. Review the current Render plan limits and trusted-client-IP ingress behavior before deployment. Remote lifecycle/privacy/analytics, public registration and the production policy/provider/recovery gates are still open; this blueprint alone does not provide a released pilot. An always-on worker may remain on the owner's computer if it has secure access to the same canonical database. A paid Render worker is a future explicit purchasing decision, not an action taken here. Store no durable notifications, database, uploads, keys or backups on an ephemeral free web filesystem.

The cloud setup draft declares optional credentials and non-secret defaults, preserving existing AI bindings. Saving is not activation: review/save and publish it in environment settings to apply new requirements/domains. MongoDB/Redis require their actual hostnames, native network access and separately supplied connection strings; no unknown wildcard credential destination is declared. A local computer outside this cloud must set its own secrets and network/TLS settings.
