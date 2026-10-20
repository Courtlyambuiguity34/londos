# Public indexing verification — 2026-10-20

Branch: `feature/communications-billing-2026-10-10`.
Starting commit: `4f4aa2937c89229a8d6092d94ca765289db81053`; worktree was clean.

## Outcome

Added opt-in public indexing using the canonical HTTPS `AUTH_BASE_URL`, dynamic
robots instructions, a sitemap index with 5,000-URL catalogue shards, page-specific
canonical/description/Open Graph metadata, and custom-domain launch instructions.
Kept default noindex for fixtures/local/private content. Reused the existing
publication/tenancy/moderation/pause predicates and PostgreSQL public reader.

Fixed direct department lookup beyond the first 100 navigation entries. The
navigation remains bounded; a department URL now resolves by a tenant-scoped,
non-archived database lookup. Product sitemap enumeration is independent of the
32-item shop rendering limit and 20-item department pagination.

## Commands actually executed

| Check | Result |
| --- | --- |
| Pre-change `npm run db:local` | Passed; guarded local PostgreSQL available |
| Pre-change preview/deployment configuration unit tests | 10 passed |
| `npm test -- tests/unit/search-indexing.test.ts tests/unit/preview-config.test.ts tests/unit/deployment-config.test.ts` | 29 passed, 3 files |
| `npm run build` | Passed; optimized web standalone and worker artifacts built |
| `npm run test:integration -- tests/integration/hosted-shops.test.ts tests/integration/p6.test.ts` | 23 passed, 2 files |
| `npm run typecheck` | Passed, including the final test changes |
| `npm run lint` | Passed |
| `npm run check:bundle-secrets` | Passed; 1,778 artifact files scanned against 37 configured candidate values; values not printed |
| `npm run check:docs` | Passed; local Markdown links resolve |
| `git diff --check` | Passed |

The integration runner created disposable guarded PostgreSQL databases. The
hosted suite launched the real compiled server with hosted/secure-origin settings,
real PostgreSQL and fictional email settings, without a worker or provider calls.
It created a department/product through the authenticated merchant API, privately
previewed and published the layout, checked public discovery, and unpublished it.

Additional indexing assertions executed:

- Canonical and social metadata, correct custom-origin sitemap references,
  dynamic robots output and no-store sitemap responses.
- Private/search pages remain noindex; guest, foreign-tenant and hostile-origin
  access restrictions remain intact. Shopkeeper navigation still requires
  an active merchant membership; revocation/sign-out remove it.
- Suspended moderation, closed tenancy, temporarily closed publication, operator
  pause, archived department/product and unpublished design exclude affected
  sitemap entries. Hidden shops cannot be opened publicly.
- 5,001 additional fictional products appeared exactly once across two shards;
  the first shard contained 5,000 URLs. The 101st additional department resolved
  directly and had a canonical link despite the bounded navigation list.
- Invalid shard types/pages return 404. Opt-out routes never open a database
  connection. Simulated database failures return empty retryable 503 responses
  without driver details. An attacker-supplied request host cannot change URLs.
- Fixture/disabled/local/malformed configuration remains noindex, even if the
  indexing flag is requested. XML escaping and batch-boundary counts verified.

No P12 recovery/production drills were repeated. No production database, DNS,
domain, Render setting, real email, external search submission or search-engine
index was changed. The artifact scan checks exact configured values, not every
possible unknown secret. No actual Google/Bing indexing or rankings are claimed.

## Files added or changed

- `src/server/search-indexing.ts`: guarded canonical-origin and metadata helpers.
- `src/server/sitemaps.ts`: visibility-filtered public URL queries, batching and XML.
- `src/app/sitemap.xml/route.ts`: dynamic sitemap index endpoint.
- `src/app/sitemaps/[kind]/[page]/route.ts`: validated dynamic child sitemaps.
- `src/app/robots.ts`: runtime public crawling opt-in; private paths excluded.
- `src/app/page.tsx`: mall metadata.
- `src/app/categories/[slug]/page.tsx`: category metadata.
- `src/app/shops/[slug]/page.tsx`: public shop metadata.
- `src/app/shops/[slug]/departments/[department]/page.tsx`: department metadata.
- `src/app/shops/[slug]/products/[product]/page.tsx`: product/service metadata.
- `src/components/public-shop-page.tsx`: metadata from the cached authorized public
  view; missing, failed and cursor destinations remain noindex.
- `src/server/public-shop.ts`: direct department lookup beyond navigation cap.
- `src/app/layout.tsx`: general description; root noindex default retained.
- `tests/unit/search-indexing.test.ts`: opt-in, XML, batching and failure tests.
- `tests/integration/hosted-shops.test.ts`: hosted indexing/security regression coverage.
- `.env.example` and `deploy/.env.example`: documented indexing flag, default false.
- `docs/SEARCH-INDEXING-AND-DOMAINS.md`: domain, DNS, canonical origin, indexing and
  Search Console instructions with official sources checked on this date.
- `docs/RENDER-SETUP.md` and `README.md`: links to the new guide.
- This evidence file: executed results and operator handoff.

## Operator handoff

Follow [the domain/indexing guide](../SEARCH-INDEXING-AND-DOMAINS.md). After the new
domain has verified DNS and HTTPS, set the exact `AUTH_BASE_URL` on web and worker.
Enable `LONDOS_SEARCH_INDEXING=true` on the web service only when the intended
public catalogue is ready. Submit `/sitemap.xml` through Search Console and
monitor crawl results. Optional app installation is not needed for public access.
The existing hosted production workflow limitations in [Render setup](../RENDER-SETUP.md)
still apply; this change does not bypass them.
