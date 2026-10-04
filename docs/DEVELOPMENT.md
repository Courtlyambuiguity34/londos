# Development and the High-stage public preview

The current application is a read-only demonstration of the public Londos journey. Every business, illustrated product and price is fictional. It has no accounts, applications, enquiries, payments, uploads, published LSS, PostgreSQL or AI provider calls. Capability status is also returned by `/api/health`.

## Prerequisites and installation

- Node **24.19.0** (see `.nvmrc`); supported engine range is Node 24.
- npm **11.9.0** (one npm lockfile).
- No database or external credential is required for this stage.

From the repository root:

```bash
npm ci --no-fund
npm run dev
```

The development server uses port 3000 by default. Use local requests for cloud validation; publication/preview routing depends on the hosting product. Do not commit `.env`, `.cache`, generated data or build outputs.

`.npmrc` keeps the package cache in ignored `.cache/npm` under the checkout because this cloud machine's home cache is unwritable. It preserves registry/TLS verification. System fonts and 17 local, platform-owned SVG illustrations mean builds do not require a remote font/image service.

## Production-mode preview

```bash
npm run build
npm run start -- --port 3000
```

The build creates Next.js standalone output; `postbuild` copies local public/static assets into it. The start wrapper runs that output and handles process signals. Use the packaged standalone output with `node .next/standalone/server.js` and environment `PORT`/`HOSTNAME` if launching it directly. This is a deployable preview artifact, not the complete production commercial platform.

`LONDOS_DATA_SOURCE` defaults to `fixtures` and only accepts that source in this stage. Setting it to database mode fails explicitly rather than claiming a working database adapter. `.env.example` contains configuration names/comments without secrets.

## Checks

```bash
npm run check
npm run format:check
npm audit --audit-level=high
npm run build
```

`check` runs lint, type checking, fixture discovery/catalogue behavior tests, and local documentation-link validation. These are public preview checks, not PostgreSQL or authenticated tenant-isolation tests.

For browser checks after the production build, either install Playwright's supported Chromium:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

or use the cloud machine's installed Chromium:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

The browser runner launches the production server on port 3100, exercises desktop/mobile journeys, and checks automated WCAG A/AA rules and overflow. It stops its own server. Reports/traces/screenshots go to ignored `playwright-report/` and `test-results/`. Automated checks do not replace later manual accessibility, device/network, security or recovery reviews.

The CI workflow runs the same checks and uses Playwright-managed Chromium. Its configuration has been prepared; a local passing run does not mean GitHub Actions has executed.

## Module boundaries

- `src/modules/catalogue`: typed public demonstration content.
- `src/modules/discovery`: bounded shop-first fixture search, department routing and formatting.
- `src/server`: server-only preview capability/configuration checks.
- `src/components`: reusable presentation, accessible navigation/forms and shop/product UI.
- `src/app`: server-rendered public routes and honest workspace gateways.
- `scripts`: document validation, standalone packaging and startup.
- `tests`: public behavior and production-browser evidence.

The fixture lookup functions are not authorization code. Replace them through reviewed domain/repository interfaces after X1 establishes canonical persistence and permissions. Do not turn the gateway routes into working private tools using a temporary frontend-only role check.

No global `loading.tsx` streaming boundary is used for this preview: flushing a shell before resource validation can turn a missing-route response into HTTP 200. A reusable loading-state component is retained; place future loading boundaries only after validating which HTTP/status behavior they preserve. Test missing/restricted routes when changing streaming or cache policy.

## Tooling compatibility

The foundation uses supported ESLint 10, TypeScript ESLint and React Hooks rules. Their declared peers accept the selected versions. Native lint rules require platform image components and prohibit raw script elements. Browser axe checks provide additional accessibility coverage.

`eslint-config-next` currently brings peers restricted to unsupported ESLint 9; the separate Next lint plugin also brings an unpatched high-severity `braces`/`fast-glob` development dependency chain. The optional plugin was omitted after isolating that audit finding; the maintained core/TypeScript/Hooks checks and all browser/behavior assertions remain active. No forced dependency downgrade, ignored advisory or weakened test was used. Reconsider the full Next lint plugin once its dependency chain is repaired. CI audits both development and runtime dependencies; a clean audit is not a complete security assessment.

## Next stage

The owner must confirm **Sol 6.1 Extra High** before X1 (P2–P4): PostgreSQL schema/migrations, authentication/MFA, tenant-scoped repositories, durable transactions/outbox/jobs and attack tests. Provider credentials and live integrations belong to subsequent stages. Read [BUILD-STATUS](BUILD-STATUS.md), [RECOMMENDATIONS](../RECOMMENDATIONS.md), [CONTRACTS](CONTRACTS.md), and [the plan](IMPLEMENTATION-PLAN.md) when resuming.
