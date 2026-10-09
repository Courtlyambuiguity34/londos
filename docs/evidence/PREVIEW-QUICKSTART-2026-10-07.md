# Preview and quickstart handoff — 2026-10-07

Starting source: `993ab1c44c202f49810b6c697af33af45eee5054`, branch `codex/londos-x2-2026-10-05`. The owner narrowed the resumed review to a temporary visual preview and committed local/Render/Vercel instructions. The wider deployment review is not declared complete.

## Delivered

- [Deployment quickstart](../DEPLOYMENT-QUICKSTART.md), linked from README, with separate credential-free catalogue and PostgreSQL-backed profiles, local startup, Render setup, optional providers and Vercel limitations.
- The compiled web application started internally on port 3000 in fixture mode. Fresh requests to `/api/ready`, `/`, and `/shops/annette-fashion-house` returned HTTP 200 with the expected fixture readiness or rendered content. `/mall` is not an application route and returned 404; the catalogue entry point is `/`.
- The cloud chat interface has no supported interactive web-preview exposure. No shareable URL, Render service or Vercel deployment was created. Internal startup does not establish that the user can access this cloud process.
- Two small corrections preserved from the interrupted review: malformed canonical/authentication URL errors now omit the input and native error cause; browser warning fixtures explicitly mask optional provider credentials and supply deterministic feature flags. Browser captures now use per-test output paths, preserving tracked historical evidence images.

## Checks actually executed

| Check | Result |
| --- | --- |
| `npm test -- tests/unit/config-redaction.test.ts` | 2 new malformed-configuration redaction tests passed. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- services.spec.ts` | 2 desktop/mobile tests passed using the checked-in default server configuration, without manual MongoDB/Cloudinary/Redis overrides. Native MFA, no-store responses, warnings, accessibility and overflow assertions executed. |
| `npm run build` | Passed; web, worker, operations and migrator packaged. Rebuilt because runtime configuration code changed. |
| Targeted ESLint on `src/server/config.ts`, `playwright.core.config.ts`, `tests/e2e-core/services.spec.ts`, and `tests/unit/config-redaction.test.ts` | Passed with zero warnings. |
| Targeted Prettier formatting | Completed for the four changed TypeScript files. |
| `npm run check:docs` | Passed; rerun after the new handoff because the documentation links changed. |
| Fixture startup requests | Three expected routes passed; no database/authentication/worker availability claimed in this profile. |
| Configured-secret artifact scan | Passed for current tracked/untracked public files, compiled outputs, browser artifacts and private logs. Exact configured-value scan, not an exhaustive secret detector. |

Previously passed broad unit/integration suites and expensive P12 recovery/production drills were not repeated. The browser run specifically covers a previously uncovered default-CI configuration path. No Redis service was provisioned. The browser wrapper created and removed its own disposable PostgreSQL test database; it did not seed or migrate the main catalogue.

## MongoDB and deployment boundaries

Before the workspace restart, the delivered Atlas URL parsed with safe TLS settings, but its selected database conflicted with `MONGODB_DATABASE`. The normal verifier rejected that ambiguity safely. An isolated child process with only the database override empty selected `londos` from `MONGODB_URL`; connection verification failed, and a separate sanitized DNS diagnostic returned `ENOTFOUND`. The outside-sandbox DNS retry was interrupted before execution, so it supplies no additional result. No real CRUD operation ran, no credential was printed, and no persistent secret or database selector was changed.

The quickstart explains how to make the two database selectors agree privately. No Atlas success, real Cloudinary upload, Brevo inbox delivery or full production readiness is claimed. PostgreSQL remains authoritative, Redis optional, and existing tenant/financial/privacy guards remain intact.

Render and Vercel official plan pages were fetched successfully for the documented limits on 2026-10-07. Render's free web service is appropriate for the limited fictional catalogue demonstration; the full deployment still requires reachable PostgreSQL, an independent worker and the documented release obligations. Vercel Hobby restricts use to personal, non-commercial projects.

The separate designer branch and prior evidence remain preserved. Consolidation and source-bound comprehensive verification are separate pending work; this narrow preview/documentation task does not close G5.
