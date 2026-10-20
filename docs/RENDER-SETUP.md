# Initial Render setup and deployment usage

For a purchased domain and public shop/product discovery, follow
[Public search indexing and your domain](SEARCH-INDEXING-AND-DOMAINS.md).
Adding an environment variable alone does not connect DNS. Indexing is an explicit
runtime opt-in after the real catalogue and verified HTTPS domain are ready.

This is a reviewable setup guide, not evidence of a deployed production service. Use [render.web.yaml](../deploy/render.web.yaml) for the free Docker web service and [render.html](../render.html) for the offline checklist. No paid resource, DNS change or production exposure is authorized by running local verification.

## Current readiness — checked 2026-10-14

**Suitable for a controlled hosted staging check, not yet a complete live shop-rental launch.**
The production web/worker artifacts build. Existing merchants can edit their catalogue and
save, privately preview, publish and unpublish designs with local adapters disabled. The
public database-browsing guard now permits valid hosted PostgreSQL configuration. See the
[shop verification and remaining blockers](evidence/RENDER-SHOPS-2026-10-14.md) for tests
actually executed and their limits.

Environment values alone do **not** complete production onboarding: applications,
provisioning, rent and several operator workflows still enforce `local_lifecycle_only`.
Trusted ingress/client-IP handling, real account/operator provisioning, live provider
checks and the release gates remain outstanding. Do not remove those guards or enable
`LONDOS_LOCAL_ADAPTERS` on Render to work around them. Seeded demonstration accounts are
not a production onboarding process.

## Supported architecture

Render can host the web artifact alongside **MongoDB Atlas and Cloudinary**, but this Londos implementation also requires **reachable PostgreSQL and an independent supervised worker**. MongoDB stores optional public catalogue copies; it does not implement canonical native authentication, tenancy/rent, SQL integrity constraints, jobs or audit. Redis is optional and can remain completely absent.

Render does not block PostgreSQL URLs. `DATABASE_URL` may name a Render database or another
reachable PostgreSQL service whose current plan, TLS and access controls the owner has reviewed. The
practical restriction is that Render cannot connect to the owner's `localhost`; it is not a
PostgreSQL protocol restriction. Provider free-tier availability and sleeping/storage limits change,
so confirm the current terms rather than encoding a free-service promise in Londos.

The owner's local PostgreSQL can serve a local installation. A Render container cannot reach that computer's loopback address. For Render, use a reviewed reachable PostgreSQL service or an explicitly protected network route to the owned server. Preserve certificate/hostname verification and least-privilege roles. Do not expose the database openly or label MongoDB-only Render as supported.

A free web instance's sleeping/ephemeral behavior is not an always-on worker, database, key store or backup system. Review current [Render free-service limits](https://render.com/docs/free). This guide does not create a paid worker/database. An owned, always-on supervised worker may connect securely to the same PostgreSQL database. Any paid hosting choice remains a separate owner decision.

## Prepare before the first deployment

1. Select the exact reviewed commit on `feature/communications-billing-2026-10-10`. Run the local checks and review [current shop evidence](evidence/RENDER-SHOPS-2026-10-14.md) and [earlier provider evidence](evidence/SERVICES-2026-10-07.md). Source changes after the old G5 packet require a new comprehensive verification candidate; do not reuse its green checks as a claim about this commit.
2. Back up the canonical database and private configuration. Use a migrator owner separate from web/worker roles, following [the release runbook](RELEASE-RUNBOOK.md). Apply the branch's immutable migrations to the selected database, then provision reviewed runtime roles. This is not a MongoDB migration. Never run development seed/reset helpers against a remote database.
3. Provision the independent worker/monitor and their reviewed credentials, encrypted independent backups, key recovery/current privacy authority and responder ownership. Review the remaining [G5 manifest](launch/G5-DECISIONS.json).
4. Verify Brevo's sender and API access. `mnelsontravor@gmail.com` / `Londos` is the proposed temporary sender; an owned domain/mailbox needs its own verified sender and DNS authentication. A read-only key check does not prove inbox delivery.
5. Review trusted-client-IP handling. Londos's security boundary expects a reviewed ingress to overwrite `x-londos-client-ip`; accepting a client-supplied value weakens abuse controls. In addition, `src/server/security/auth-http.ts` currently replaces authentication request IPs with loopback, so setting a proxy header alone is not sufficient. The staging nginx configuration demonstrates an ingress boundary, but adapting and verifying both the application and edge for Render remains required.

## Create the free web service

Connect the repository through Render's own account UI. Create a Docker web service on the reviewed branch/commit, or import the review-only blueprint. The Dockerfile is `deploy/Dockerfile`, build context is the repository root, health path is `/api/ready`, and automatic deployment is **off**. Do not create a Node build with a different start command accidentally; the Docker artifact includes the compiled web and independent worker/operations/migrator entry points.

Store secrets through Render's server-side environment facility. Do not put values in `render.html`, the YAML, a tracked `.env`, build arguments or screenshots. Render supplies `PORT`; the image listens on `0.0.0.0`.

### Import the environment template

Use [deploy/.env.example](../deploy/.env.example), not the root `.env.example` (which
intentionally retains the credential-free local preview defaults). In Render's service
Environment settings, import/paste the entries using its `.env` import facility, or enter
each key individually. Fill **all five blank required values**: `DATABASE_URL`,
`AUTH_SECRET`, `AUTH_BASE_URL`, `LONDOS_BREVO_API_KEY` and `LONDOS_EMAIL_FROM`.
Keep optional provider entries commented/unset until you deliberately enable them.
Blank placeholders are not working credentials. Your existing private `.env.local`
has not been overwritten and must not be uploaded or committed.

Apply the settings to **both web and worker**. They need the same database, stable
`AUTH_SECRET`, canonical `AUTH_BASE_URL` and compatible feature settings; reviewed runtime
database roles can have different passwords/permissions. A YAML anchor is not a secret
sharing mechanism. If your PostgreSQL provider requires a public CA certificate, upload
it separately to both services and set `LONDOS_RUNTIME_CA_FILE` to its mounted path.
Never disable TLS certificate verification.

The [full-service blueprint](../deploy/render.full.yaml) includes a free web service and a
**paid `starter` worker**, not a wholly free deployment. Alternatively supervise the worker
on your own always-on machine. Migrations must run separately with the migrator role;
the web process does not run them automatically. The root `render.yaml` remains a
fixture-preview blueprint, not a full merchant deployment.

| Setting                                       | Required value or action                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Reachable canonical PostgreSQL URL for the reviewed web role, with verified TLS/trust.                                      |
| `AUTH_SECRET`                                 | Privately generated stable secret, at least 32 characters. Preserve across replicas/restarts; rotation affects native auth. |
| `AUTH_BASE_URL`                               | The exact HTTPS Render/custom-domain origin, no path/query/credentials.                                                     |
| `LONDOS_CORE_ENABLED` / `LONDOS_DATA_SOURCE`  | `true` / `database`.                                                                                                        |
| `LONDOS_LOCAL_ADAPTERS`                       | `false`; private development sinks cannot serve remote authentication.                                                      |
| `LONDOS_DATABASE_ENGINE` / migration flag     | `postgresql` / `LONDOS_MONGODB_MIGRATION_ENABLED=false`.                                                                    |
| `LONDOS_EMAIL_PROVIDER`                       | `brevo`.                                                                                                                    |
| `LONDOS_EMAIL_FROM`, `LONDOS_EMAIL_FROM_NAME` | Actual verified sender email and name.                                                                                      |
| `LONDOS_BREVO_API_KEY`                        | Real private key, never a mock placeholder in remote authentication.                                                        |
| `LONDOS_EMAIL_MAX_PER_HOUR` / `...PER_DAY`    | `250` / `250` conservative caps; confirm both against the current Brevo plan before enabling delivery.                      |
| `LONDOS_MONTHLY_REPORTS_ENABLED`              | Start `false`; enable only after analytics/privacy and live-email approval.                                                 |
| `LONDOS_REDIS_ENABLED`                        | `false`; leave `REDIS_URL` unset.                                                                                           |
| `LONDOS_AI_REMOTE`                            | Start with `false`; remote AI requires verified bindings/models, consent, budgets and acceptance.                           |

Keep analytics/erasure and live collection at the existing authorized settings. Remote privacy/lifecycle/pilot acceptance is incomplete; changing a development guard is not a release implementation.

Render supplies an `onrender.com` HTTPS address, so purchasing a domain is not required for an
initial hosted check. If a custom domain is later attached, change `AUTH_BASE_URL` to that one exact
canonical origin, update the provider configuration, restart both services and verify sign-in and
origin protections. Do not operate two competing authentication origins as if they were one session.

## Add Atlas and Cloudinary manually

To use public copies on Render or on an owned machine, add the same server-side settings:

- **Atlas:** preferred secret `MONGODB_URL`, explicit dedicated database in the URI or `MONGODB_DATABASE`, and `LONDOS_MONGODB_ENABLED=true`. Retain legacy `MONGODB_URI` only if needed and do not supply conflicting values. Give the database user only the required access to the dedicated Londos copy database. Atlas's network rules must cover the approved deployment egress, not all IPs. Keep TLS/hostname verification on; the verifier rejects insecure flags.
- **Cloudinary:** secret `CLOUDINARY_URL` and `LONDOS_CLOUDINARY_ENABLED=true`. Both services are required for the existing manual public catalogue-with-images copy command. See [media storage/linkage](CLOUDINARY-MEDIA.md).
- **Redis:** leave disabled and unset. Rent/subscriptions and durable scheduling continue using PostgreSQL.

These flags do not automatically sync the catalogue, enable CDN application rendering, replace the main database or bypass production gates. Copy commands require a selected published shop UUID and explicit confirmation. Use a protected operator checkout/tooling host to run `npm run mongo:verify`, `npm run email:verify` and `npm run services -- check`; the minimal production Docker image does not package these TypeScript developer CLIs. Supply secrets privately on that host, not through command-line URI arguments. No public diagnostic endpoint exposes them.

## Start, inspect and use

### Open the three interfaces

The existing web deployment includes all three interfaces. Replace `YOUR-SERVICE`
with the name of your actual Render web service:

| Interface                | Address                                        |
| ------------------------ | ---------------------------------------------- |
| Public mall              | `https://YOUR-SERVICE.onrender.com/`           |
| Shopkeeper               | `https://YOUR-SERVICE.onrender.com/shopkeeper` |
| Landlord / administrator | `https://YOUR-SERVICE.onrender.com/landlord`   |
| Sign in                  | `https://YOUR-SERVICE.onrender.com/sign-in`    |
| Install a PWA            | `https://YOUR-SERVICE.onrender.com/install`    |

No separate site upload, database or Render web service is needed for these paths.
Keep `AUTH_BASE_URL` as the shared HTTPS origin, without `/landlord` or `/shopkeeper`.
The header links to Shopkeeper only when the visitor has a current verified session
and an active owner/staff merchant membership; guests and accounts without that
membership do not receive the link. The footer's **Londos Management** links to Landlord.
Shopkeepers see only shops assigned to their active memberships. Landlord access needs
operator grants and verified MFA; opening the address or registering an ordinary
account does not grant administrator permissions. Local demo credentials do not
automatically exist in a new Aiven database. Production provisioning and the lifecycle
limitations described above still apply.

As of 2026-10-15, the shared header/footer display development notices only for fixture
previews or database mode with local adapters. Hosted database mode removes those
development labels. This presentation change does not enable payments, remove
permission checks, turn demo records into real shops or close the production gates.

Deploy the exact reviewed image/commit manually. Start the separate worker from the same compatible artifact against the same canonical database; the image supports the `worker` entry point, and `npm run worker` is available in a built owner checkout. Keep worker supervision and database migrations separate from web startup.

Inspect `/api/ready` after startup: require `database=true`, `authentication=true`, a current `worker=ready` heartbeat and the expected `configured-core` mode. Readiness indicates configured native auth and schema compatibility, not live deliverability or a closed launch gate. Test public browsing and a genuine verified, MFA-protected operator/merchant workflow only after the required provisioning is complete. Public registration is not an automatically approved production onboarding path in this candidate.

The operations status page `/landlord/services` requires operations permission and recent native MFA. It displays warnings for enabled services with missing/invalid settings and labels intentionally disabled providers. It makes no external checks and never prints connection strings. For provider failures, run the protected CLI verification and preserve only its sanitized report. Brevo uncertain/rejected delivery attempts require reconciliation; never reset their durable history to force a resend.

## Upgrade and rollback

Keep automatic deployment off until a reviewed release procedure exists. Before an upgrade, back up, review migration compatibility, test a new candidate and record new evidence. Never overwrite P12/G5 historical reports or edit a previously applied migration. A rollback must support the actual schema and durable Brevo/demo-account behavior; an old P12 image is not blanket approval for new provider/state rollback. Follow [recovery requirements](FAILURE-RECOVERY.md) and the release runbook.

For a local preview, start with [first local setup](LOCAL-FIRST-SETUP.md). For live release, real credentials, reachable PostgreSQL/worker, ingress, independent recovery, policy/ownership decisions, field accessibility/network evidence and final owner authorization remain prerequisites. Missing credentials can be added later, but their live checks must pass before claiming those integrations work.
