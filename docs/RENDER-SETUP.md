# Initial Render setup and deployment usage

This is a reviewable setup guide, not evidence of a deployed production service. Use [render.web.yaml](../deploy/render.web.yaml) for the free Docker web service and [render.html](../render.html) for the offline checklist. No paid resource, DNS change or production exposure is authorized by running local verification.

## Supported architecture

Render can host the web artifact alongside **MongoDB Atlas and Cloudinary**, but this Londos implementation also requires **reachable PostgreSQL and an independent supervised worker**. MongoDB stores optional public catalogue copies; it does not implement canonical native authentication, tenancy/rent, SQL integrity constraints, jobs or audit. Redis is optional and can remain completely absent.

The owner's local PostgreSQL can serve a local installation. A Render container cannot reach that computer's loopback address. For Render, use a reviewed reachable PostgreSQL service or an explicitly protected network route to the owned server. Preserve certificate/hostname verification and least-privilege roles. Do not expose the database openly or label MongoDB-only Render as supported.

A free web instance's sleeping/ephemeral behavior is not an always-on worker, database, key store or backup system. Review current [Render free-service limits](https://render.com/docs/free). This guide does not create a paid worker/database. An owned, always-on supervised worker may connect securely to the same PostgreSQL database. Any paid hosting choice remains a separate owner decision.

## Prepare before the first deployment

1. Select the exact reviewed commit on `feature/cross-platform-local-launchers-2026-10-09`. Run the local checks and review [current integration evidence](evidence/SERVICES-2026-10-07.md). Source changes after the old G5 packet require a new comprehensive verification candidate; do not reuse its green checks as a claim about this commit.
2. Back up the canonical database and private configuration. Use a migrator owner separate from web/worker roles, following [the release runbook](RELEASE-RUNBOOK.md). Apply the branch's immutable migrations to the selected database, then provision reviewed runtime roles. This is not a MongoDB migration. Never run development seed/reset helpers against a remote database.
3. Provision the independent worker/monitor and their reviewed credentials, encrypted independent backups, key recovery/current privacy authority and responder ownership. Review the remaining [G5 manifest](launch/G5-DECISIONS.json).
4. Verify Brevo's sender and API access. `mnelsontravor@gmail.com` / `Londos` is the proposed temporary sender; an owned domain/mailbox needs its own verified sender and DNS authentication. A read-only key check does not prove inbox delivery.
5. Review trusted-client-IP handling. Londos's security boundary expects a reviewed ingress to overwrite `x-londos-client-ip`; accepting a client-supplied value weakens abuse controls. The staging nginx configuration demonstrates the boundary, but adapting it to Render requires provider-specific review.

## Create the free web service

Connect the repository through Render's own account UI. Create a Docker web service on the reviewed branch/commit, or import the review-only blueprint. The Dockerfile is `deploy/Dockerfile`, build context is the repository root, health path is `/api/ready`, and automatic deployment is **off**. Do not create a Node build with a different start command accidentally; the Docker artifact includes the compiled web and independent worker/operations/migrator entry points.

Store secrets through Render's server-side environment facility. Do not put values in `render.html`, the YAML, a tracked `.env`, build arguments or screenshots. Render supplies `PORT`; the image listens on `0.0.0.0`.

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
| `LONDOS_REDIS_ENABLED`                        | `false`; leave `REDIS_URL` unset.                                                                                           |
| `LONDOS_AI_REMOTE`                            | Start with `false`; remote AI requires verified bindings/models, consent, budgets and acceptance.                           |

Keep analytics/erasure and live collection at the existing authorized settings. Remote privacy/lifecycle/pilot acceptance is incomplete; changing a development guard is not a release implementation.

## Add Atlas and Cloudinary manually

To use public copies on Render or on an owned machine, add the same server-side settings:

- **Atlas:** preferred secret `MONGODB_URL`, explicit dedicated database in the URI or `MONGODB_DATABASE`, and `LONDOS_MONGODB_ENABLED=true`. Retain legacy `MONGODB_URI` only if needed and do not supply conflicting values. Give the database user only the required access to the dedicated Londos copy database. Atlas's network rules must cover the approved deployment egress, not all IPs. Keep TLS/hostname verification on; the verifier rejects insecure flags.
- **Cloudinary:** secret `CLOUDINARY_URL` and `LONDOS_CLOUDINARY_ENABLED=true`. Both services are required for the existing manual public catalogue-with-images copy command. See [media storage/linkage](CLOUDINARY-MEDIA.md).
- **Redis:** leave disabled and unset. Rent/subscriptions and durable scheduling continue using PostgreSQL.

These flags do not automatically sync the catalogue, enable CDN application rendering, replace the main database or bypass production gates. Copy commands require a selected published shop UUID and explicit confirmation. Use a protected operator checkout/tooling host to run `npm run mongo:verify`, `npm run email:verify` and `npm run services -- check`; the minimal production Docker image does not package these TypeScript developer CLIs. Supply secrets privately on that host, not through command-line URI arguments. No public diagnostic endpoint exposes them.

## Start, inspect and use

Deploy the exact reviewed image/commit manually. Start the separate worker from the same compatible artifact against the same canonical database; the image supports the `worker` entry point, and `npm run worker` is available in a built owner checkout. Keep worker supervision and database migrations separate from web startup.

Inspect `/api/ready` after startup: require `database=true`, `authentication=true`, a current `worker=ready` heartbeat and the expected `configured-core` mode. Readiness indicates configured native auth and schema compatibility, not live deliverability or a closed launch gate. Test public browsing and a genuine verified, MFA-protected operator/merchant workflow only after the required provisioning is complete. Public registration is not an automatically approved production onboarding path in this candidate.

The operations status page `/landlord/services` requires operations permission and recent native MFA. It displays warnings for enabled services with missing/invalid settings and labels intentionally disabled providers. It makes no external checks and never prints connection strings. For provider failures, run the protected CLI verification and preserve only its sanitized report. Brevo uncertain/rejected delivery attempts require reconciliation; never reset their durable history to force a resend.

## Upgrade and rollback

Keep automatic deployment off until a reviewed release procedure exists. Before an upgrade, back up, review migration compatibility, test a new candidate and record new evidence. Never overwrite P12/G5 historical reports or edit a previously applied migration. A rollback must support the actual schema and durable Brevo/demo-account behavior; an old P12 image is not blanket approval for new provider/state rollback. Follow [recovery requirements](FAILURE-RECOVERY.md) and the release runbook.

For a local preview, start with [first local setup](LOCAL-FIRST-SETUP.md). For live release, real credentials, reachable PostgreSQL/worker, ingress, independent recovery, policy/ownership decisions, field accessibility/network evidence and final owner authorization remain prerequisites. Missing credentials can be added later, but their live checks must pass before claiming those integrations work.
