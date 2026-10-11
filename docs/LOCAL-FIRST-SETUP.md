# First local installation and usage

Use the current implementation branch, `feature/cross-platform-local-launchers-2026-10-09`. Keep an existing checkout, database volume, `.env.local` and private `.local` files. Do not reset the repository, delete a volume, or reseed from an unrelated account file.

## Prerequisites

The verified automated test platform is Linux/Ubuntu with Node **24.19.0**, npm **11.9.0**, and Docker with a working local daemon. The Windows launcher now provisions native PostgreSQL 18 directly and does not require Docker or WSL; its UAC/service path still requires verification on a real Windows machine. macOS uses Docker. Internet is needed for the first runtime/database download and optional providers. Redis is **not required**, including for tenancy, rent/subscriptions, scheduling or startup.

For a new checkout:

```bash
git clone https://github.com/Courtlyambuiguity34/londos.git
cd londos
git switch feature/cross-platform-local-launchers-2026-10-09
npm ci --no-fund
npm run db:local
```

`db:local` uses native PostgreSQL on Windows and a pinned PostgreSQL container on macOS/Linux. A fresh Windows install and the container bind loopback port **54329**; an existing Windows PostgreSQL 18 service may use a configured local port. Persistent data and random credentials stay in ignored files. Docker is required only on macOS/Linux. MongoDB is not a replacement for this canonical PostgreSQL database.

## Configure, migrate and seed

Open `.env.local` in a private local editor. Do not copy it to Git, screenshots, support tickets or this chat. Keep the generated `DATABASE_URL` and `AUTH_SECRET`. Set:

```dotenv
LONDOS_DATA_SOURCE=database
LONDOS_CORE_ENABLED=true
AUTH_BASE_URL=http://127.0.0.1:3000
LONDOS_LOCAL_ADAPTERS=true
LONDOS_DATABASE_ENGINE=postgresql
LONDOS_MONGODB_MIGRATION_ENABLED=false
LONDOS_MONGODB_ENABLED=false
LONDOS_CLOUDINARY_ENABLED=false
LONDOS_REDIS_ENABLED=false
LONDOS_AI_REMOTE=false
```

Then run:

```bash
npm run db:migrate
npm run db:seed
npm run db:operations
npm run build
npm run start -- --port 3000
```

In a second terminal in the same directory:

```bash
npm run worker
```

Visit `http://127.0.0.1:3000`. Inspect `/api/ready`: expect `database=true`, `authentication=true`, `worker=ready`, and `mode=development-core`. `fixture-preview` means you are viewing fictional public fixtures instead of the database; `worker=offline` means the separately supervised worker needs attention. A ready response does not certify real email or production launch readiness.

Migrations verify immutable checksums. On this branch schema **020_combined_feature_contract.sql** is the required schema. Never edit an applied migration to make it pass. Migration 020 is the additive reconciliation of the prior release/demonstration and designer work; do not replace either earlier migration in an existing database.

## Try the product

Open ignored `.local/development-accounts.json` privately to obtain the seeded owner A, owner B, staff and review-operator sign-in details. These are fictional accounts with random passwords, not real pilot participants. Sign in through `/sign-in`.

- **Shopkeeper:** open the owner's shop, edit departments/products, upload a real product image with meaningful alternative text, inspect the design and merchant contact settings. Media processing requires the worker. A ready image is normalized; source/quarantine files are private.
- **Design:** supported deterministic instructions need no provider. AI proposals remain private; applying a proposal saves a draft, and publication is a separate explicit fresh action. Enable remote AI only using the verified models, consent and budgets in [AI environment setup](AI-ENVIRONMENT.md).
- **Landlord:** sign in as the seeded review operator and enroll native MFA under `/security`. `db:operations` grants this explicitly identified fictional operator operations permission. Open **Service configuration and warnings**, `/landlord/services`, after recent MFA. The page exposes fixed configuration messages, never secret values; it does not call providers.
- **Optional demonstrations:** `npm run db:demonstration` creates the authorized 12-account development cohort. Its private credentials are in `.local/demonstration-accounts.json`. The operations operator can remove these registered fictional accounts from `/landlord/demo-accounts`; this revokes access and hides shops while retaining business/audit history.
- **Development rent:** `npm run db:p8` prepares the guarded local rent workflow. The policy is configurable **UGX 5,000 per 30 days, seven-day grace, manual operator reconciliation**. Live collection remains disabled. Follow [deployment profiles](DEPLOYMENT-PROFILES.md) and the [pilot runbook](PILOT-RUNBOOK.md); fictional payments are not business validation.

## Optional MongoDB and Cloudinary

The same local application can manually enable MongoDB/Cloudinary. Store actual credentials in server-side environment settings or the ignored local file. Never use a `NEXT_PUBLIC_` name for a secret.

| Setting                          | Purpose                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URL`                    | Preferred MongoDB connection string. Legacy `MONGODB_URI` works; different values supplied under both names are rejected.                                     |
| `MONGODB_DATABASE`               | Explicit dedicated database, e.g. `londos_public_copy`, if the URI has no database. If both select a database they must match. System databases are rejected. |
| `LONDOS_MONGODB_ENABLED=true`    | Enables manual copy/read/check commands. It does not move PostgreSQL authority or automatically export anything.                                              |
| `CLOUDINARY_URL`                 | Cloudinary credential URL stored privately; its documented format is in `.env.example`.                                                                       |
| `LONDOS_CLOUDINARY_ENABLED=true` | Enables public normalized image copies and read-only usage verification.                                                                                      |
| `LONDOS_REDIS_ENABLED=false`     | Keep disabled when Redis is absent. `REDIS_URL` can remain unset.                                                                                             |

Restart application/worker commands after editing runtime settings. MongoDB verification works even with its feature flag false, without Cloudinary or Redis:

```bash
npm run mongo:verify
```

This explicit command checks the selected database, reads only Londos collection metadata/access, and performs a temporary CRUD round-trip in `londos_integration_checks`. It deletes its unique record and confirms removal. It does not drop a database/collection, export records, alter catalogue copies or migrate PostgreSQL. An empty verification collection may remain. Remote TLS certificate/hostname checks cannot be disabled. If cleanup fails, the report says so; a database operator must remove only the clearly marked temporary verification records after checking the report/time.

For manual public copies, configure **both** MongoDB and Cloudinary, then:

```bash
npm run services -- check
npm run services -- copy SHOP_UUID --confirm-public-copy
npm run services -- read SHOP_UUID
```

Replace `SHOP_UUID` with the immutable UUID of an eligible shop with a published design. These commands never publish a shop. `read` checks current PostgreSQL eligibility and prints counts, not the catalogue or image URLs. See [Cloudinary storage and MongoDB linkage](CLOUDINARY-MEDIA.md) for locating/retrieving copies and retention limits. Application images still use the existing authorized PostgreSQL media path; enabling these flags does not replace it with a CDN or make MongoDB the private application database.

## Email and missing credentials

Local adapters send notifications to the private `.local/notifications` sink. No Brevo key is required to test locally. Set the real `LONDOS_BREVO_API_KEY`, provider `brevo`, sender email and sender name only in secure settings. The proposed sender is `mnelsontravor@gmail.com` / `Londos`; Brevo must verify it. A future owned mailbox/domain also needs appropriate DNS authentication.

```bash
npm run email:verify
```

This verifies account/key acceptance and active sender status without sending email. Mock tests prove supported API contracts and fail-safe handling, not that any arbitrary key works or an inbox receives mail. Missing remote email configuration fails closed. A disabled optional provider is labelled disabled; an enabled provider with missing/invalid settings produces an admin warning. Network failures need the explicit CLI checks because admin configuration status is not network health.

## Verification and troubleshooting

```bash
npm test -- tests/unit/services.test.ts tests/unit/p13.test.ts
npm run test:integration -- tests/integration/services.test.ts tests/integration/p13.test.ts tests/integration/core.test.ts tests/integration/p5.test.ts
npm run lint
npm run typecheck
npm run check:docs
```

Integration tests use disposable databases; the MongoDB suite uses a disposable local MongoDB container and mock Cloudinary transport. It does not create a Redis service. The separate Redis integration file is optional to this targeted check. Chromium is needed for browser verification, not application startup.

Common corrections: start PostgreSQL (and Docker on macOS/Linux) before migration; select `database` instead of `fixtures`; run the worker for normalized media/jobs; complete recent native MFA for operator pages; supply the MongoDB database explicitly; keep optional flags false while their credentials are missing. MongoDB Atlas also requires its least-privilege user, DNS, verified TLS, and an Atlas access rule for the deployment's approved egress. Managed Codex native TCP access is separate from HTTP allowlists; use supported environment settings and never disable TLS or allow every IP to hide a policy failure.

Stop web/worker with Ctrl-C. On macOS/Linux, `npm run db:stop` stops the development container and retains its volume. On Windows it deliberately leaves the PostgreSQL service running and preserves its data. Restart with `db:local`, web and worker commands. Back up the database and private configuration before upgrades. Public serving from an owned computer additionally requires reviewed ingress/TLS, least-privilege roles, reliable supervision and the remaining [G5 launch obligations](launch/G5-DECISIONS.json).
