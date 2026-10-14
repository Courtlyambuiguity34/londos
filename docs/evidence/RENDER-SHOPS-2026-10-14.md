# Render and Shopkeeper review — 2026-10-14

Branch: `feature/communications-billing-2026-10-10`. Starting commit:
`2e28a7aea966fb79c21545d41a7ecb217cfb6fc3`. This report and its tests are committed
together; use the commit containing this file as the reviewed candidate. Tests ran
in the Linux cloud workspace with Node 24.19.0, local PostgreSQL and Chromium.

## Result and correction

**Existing shops can be built and published by their authorized Shopkeeper. A complete
live Render shop-rental launch is not yet ready.** Those are different claims.

The original `databaseBrowsing()` rejected `LONDOS_LOCAL_ADAPTERS=false`, including
correctly configured Render deployments. The new unit regression failed before the
fix. The guard now requires and validates the existing core/PostgreSQL configuration
without requiring development notification adapters. Hosted health reports
`database-core`; the local `database-development` and fixture labels remain unchanged.
Publication, moderation, rent eligibility and tenant authorization still run in their
existing readers; this is not a new database write path or an authorization bypass.

The [Render env template](../../deploy/.env.example) lists required settings and blank
secret values. No `.env` or `.env.local` secrets were committed or overwritten. The
root example keeps its original credential-free preview defaults. PostgreSQL remains
canonical; MongoDB, Cloudinary, Redis and remote AI remain optional and disabled in
the template. No live provider request or Render deployment was made in this review.

## Best current Shopkeeper workflow

This works for an already provisioned, eligible shop; it does not imply that remote
shop applications/provisioning are enabled.

1. Sign in as the shop's owner and open **Shopkeeper**, then the assigned shop.
   Keep each merchant in their own account; never give them an operator account.
2. Open the catalogue. Create departments, then add products/services with meaningful
   names, descriptions, availability and prices. Keep authoritative prices here, not
   in promotional design text.
3. Upload JPEG, PNG or WebP images (maximum 4 MiB each) with useful alternative text.
   Wait for the independent worker to finish image normalization before attaching an
   image to a product. A failed image has a retry action; product text stays available.
   The existing media path stores protected/normalized bytes in PostgreSQL. Enabling
   Cloudinary does not automatically replace that path with CDN rendering.
4. Configure the shop's approved contact details/actions, then open **Shop design**.
   Choose a supported theme and arrange departments/semantic sections. Current layout
   limits are eight sections and 32 cards in total. Deterministic form controls need
   neither OpenAI nor Gemini credentials.
5. Save the draft, open **Preview saved draft**, and check text, product links, contacts
   and the narrow/mobile layout. Unsaved changes are not the saved preview. A draft
   is private to authorized users, not an anonymous share link.
6. Confirm the reviewed draft and publish it. Verify `/shops/<shop-slug>` while signed
   out, including a product detail and a mall search. Publishing does not run a new
   frontend build or create a separate Render service: the same app renders each
   authorized shop's database-backed specification.
7. Use a restored layout as a **new draft**, review and publish it if appropriate.
   Restoring a layout does not restore old prices or stock. Once a shop is published,
   catalogue changes can affect the live catalogue; the private draft isolates layout,
   not an entire copy of the shop's product data. Unpublish to remove public visibility.

Visual evidence from this run: [desktop design](images/render-review-design-2026-10-14.png)
and [mobile catalogue](images/render-review-catalogue-mobile-2026-10-14.png). These show
fictional fixtures; blank image placeholders are intentional test data, not proof of
real product photography or Cloudinary delivery. The forms are functional and bounded,
but are not an unrestricted drag-and-drop website builder. Existing historical
screenshots were restored unchanged instead of being replaced with this run's images.

## Verification actually executed

| Command/check                                                                                                                                       | Observed result                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- tests/unit/deployment-config.test.ts tests/unit/preview-directory.test.ts` before changes                                              | 20 passed                                                                                                                                                                                                |
| `npm run db:local`                                                                                                                                  | Existing guarded local development PostgreSQL started; private config preserved                                                                                                                          |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- 'p5.*spec.ts' 'x2.*spec.ts' 'p11.spec.ts'` before and after the fix | 12 passed on each run: desktop/mobile catalogue, upload/worker processing, contacts, draft/preview/publish/rollback/unpublish, pagination, retry, accessibility assertions and foreign/anonymous denials |
| New `preview-config.test.ts` before/after the fix                                                                                                   | Before: 1 failed, 4 passed, reproducing the hosted guard defect. After: 5 passed                                                                                                                         |
| `npm run build`                                                                                                                                     | Production Next standalone web plus independent worker packaging passed                                                                                                                                  |
| `npm run test:integration -- hosted-shops.test.ts`                                                                                                  | 2 passed against the compiled production server, real isolated PostgreSQL and hosted feature settings                                                                                                    |
| `npm run test:integration -- p5.test.ts p6.test.ts p11.test.ts`                                                                                     | 55 passed: catalogue, media, ownership, validation, design, public eligibility and bounded rendering regressions                                                                                         |
| `npm run check`                                                                                                                                     | Lint, typecheck, 182 unit tests and documentation link checks passed                                                                                                                                     |

Final checks also passed: `npm run check:bundle-secrets` scanned 1,790 built files
against 37 configured secret candidates (exact values only, not a comprehensive secret
audit); `npm run check:docs` resolved 747 local links across 98 Markdown files;
`git diff --check` found no whitespace errors.

The new hosted integration suite runs the standalone server with `DEPLOY_MODE=render`,
an HTTPS canonical origin, `LONDOS_LOCAL_ADAPTERS=false`, fictional Brevo configuration
and **no worker**, so no mail is sent. It checks a secure cookie attribute and submits
those cookies directly over the loopback backend transport; it is not a browser TLS,
Render reverse-proxy, custom-domain or cross-origin PWA deployment test.

It verifies public HTML/health, actual sign-in, department/product creation, a private
draft preview, publication, product price rendering, public discovery and unpublication.
Anonymous catalogue access is 401; another shop's owner receives 404; a disallowed
mutation origin receives 403; anonymous private preview redirects without exposing
draft text. No notification delivery was attempted. Temporary accounts and products
exist only in isolated test databases removed by the test cleanup, not the user's
existing development database or Aiven.

**Build before running integration tests:** `npm run build && npm run test:integration`.
GitHub's PostgreSQL job now follows this order because the new regression tests the
real compiled artifact. Existing suites remain present; only the relevant subset was
run locally for this change. P12 recovery/production drills were not repeated, and
earlier provider/G5 evidence was not relabelled as current.

## Still required before a full live launch

1. **Production shop lifecycle implementation and acceptance.**
   `src/server/lifecycle-common.ts` rejects remote lifecycle operations, as called by
   `applications.ts`, `rent.ts` and `administration.ts`. Other analytics/privacy/trust
   paths also retain development restrictions. New account registration is not the
   same as approved shop provisioning. Review real policy, operator scopes, tenancy,
   billing and notification behavior before implementing those hosted paths. Do not
   bypass guards or run development seed/reset commands against a remote database.
2. **Trusted ingress/client-IP integration.** `security/auth-http.ts` deliberately
   substitutes loopback for authentication IPs. Configure and test a trusted edge
   and application IP handling together; a client-supplied forwarded header must
   never become trusted merely to make remote rate limiting appear to work.
3. **Real infrastructure and provider acceptance.** Fill the five required secrets/
   values in the template, configure verified PostgreSQL TLS and least-privilege roles,
   apply migrations with a separate migrator, provision real operator/merchant accounts
   safely, and verify Brevo account/sender plus actual delivery. None of Aiven, Render,
   Brevo, Cloudinary, MongoDB or remote AI was live-tested in this change.
4. **A supervised independent worker.** Needed for image processing, durable mail and
   maintenance. The full Render blueprint's `starter` worker is paid; free sleeping web
   hosting alone is not a replacement. `/api/ready` can return `ready=true` with
   `worker=offline`; explicitly require `worker=ready` when accepting a deployment.
5. **Release acceptance.** Backups/recovery, monitoring, policy/response ownership,
   production-specific copy, live merchant acceptance and the existing G5 decisions
   still need resolution for the final candidate. Passing these focused tests is
   not a completed G5 gate or proof of live service availability.

Follow [Render setup](../RENDER-SETUP.md) for configuration and artifact selection.
No paid resource, public tunnel, domain change or production data migration was created.
