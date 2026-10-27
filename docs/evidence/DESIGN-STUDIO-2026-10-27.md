# Design assistant repair and studio review

Checked 27 October 2026 (Africa/Kampala), continuing from `dbc9eee` on
`feature/hosted-lifecycle-secure-2026-10-23`.

## Findings and fixes

The initial local baseline passed **54 unit**, **27 database** and **four
production-browser** tests. Those existing tests mostly used deterministic
instructions or fixture providers, so they did not establish remote-provider
health for the reported request.

The screenshots show a generic request error alongside a running proposal. The
support references were not looked up in Render logs. Local reproduction and
live fictional contracts identified these concrete problems:

1. **Lost submission responses and reloaded running requests did not keep
   polling.** Polling previously depended on the current submission's busy flag,
   and only copied running records. It now follows the durable request, matches
   its original idempotency key and adopts terminal results. Cancellation has
   separate state and cannot leave the form permanently busy. GET polling uses
   deadlines and sequential intervals instead of overlapping calls.
2. **An optional OpenAI review could discard a valid Gemini design.** The live
   initial Gemini theme contract passed, while OpenAI rejected authentication or
   access in this execution environment. Review transport failures now retain
   the already validated primary candidate with an explicit acknowledgement
   requirement. Invalid reviewer content, changed authority/references and
   cancellation still fail closed.
3. **The richer Gemini contract returned an invalid new-section anchor.** A live
   response finished normally but canonical validation rejected `space.id`.
   Londos now allocates letter-led, bounded, unique anchors for new sections and
   remaps their move references. Existing section identities and catalogue UUIDs
   are never normalised or substituted. Duplicate existing identities remain
   invalid. The provider guide describes the identifier rules explicitly.
4. **Provider requests lacked the installed theme vocabulary.** The closed wire
   contract now supports named themes, includes their reviewed IDs in minimal
   context, requires every nullable property for strict structured output and
   removes unsupported defaults. The wire allowance is 24,000 bytes and output
   allowance 4,096 tokens, while canonical design/intent validation remains
   bounded. Higher reservations still obey the existing daily money ceiling.
5. **Status polling did unnecessary work and mutation locking.** It now reads
   only the current pointer, recent requests and usage, with authentication
   checks before and after. It no longer takes merchant/user mutation locks or
   loads the full media/catalogue/history for every poll. Confirmation and
   write paths retain their lock/freshness checks.
6. **Classic theme edits could be hidden beneath named styling.** A classic
   theme patch now clears the conflicting named theme/presentation, consistently
   with the manual editor, while preserving content and branding.

Overall deadline expiry is now reported as timeout rather than a user
cancellation. Safe `ai.design.failed` events contain a proposal reference and
failure code, without prompts, provider bodies or credentials.

## Designer and preview improvements

The assistant has a clear brief/result workspace, local design starting points,
installed-theme shortcuts, actionable design questions and collapsed provider
usage details. Reference URLs are not fetched or imported. A URL-only request
asks for usable design direction locally, rather than pretending to inspect a
website. Broader provider requests still require explicit external-processing
permission.

Local design recipes use the merchant's actual name/introduction and current
catalogue. They preserve existing writing and sections and add appropriate
hero, product and shop-information sections only within the existing limits.
They do not invent inventory, offers, reviews, delivery promises or financial
facts.

**Preview here** embeds the authenticated proposal in the assistant. Compare it
with the saved draft at real 1100px desktop / 390px phone viewport sizes, scaled
to fit the available screen. The full preview remains available. Preview
endpoints alone permit same-origin embedding with `frame-ancestors 'self'`;
other pages retain `DENY`. Owner/requester checks, fresh authentication,
no-store responses, catalogue fences and proposal expiry still apply.

Applying requires explicit confirmation and creates a draft. The merchant can
then change text and section variants in the manual editor before separately
publishing. The browser regression exercises this complete workflow.

## Themes and section presentation

Four original themes were added to the existing six:

| Theme | Purpose | Composition |
| --- | --- | --- |
| Mosaic | Home and lifestyle | Warm three-image collage, airy gallery and soft cards. |
| Nocturne | Beauty and luxury | Dark canvas, luminous type and framed products. |
| Botanica | Produce and agriculture | Forest accents, open poster entrance and round collections. |
| Folio | Services and portfolios | Narrow editorial canvas and focused two-column catalogue. |

One-file reviewed JSON extensions and build-time registry discovery remain in
place. Manual section controls now expose rich variants and can add heroes,
rich product collections and shop-information panels. A designed hero precedes
automatic collection tiles, with a compact shop identity rather than a second
full hero. Narrative, editorial, collection and commerce sections share clearer
spacing and readable themed surfaces in preview and public views.

Visual/automated review caught and corrected a Nocturne footer contrast issue
and a Mosaic CSS class collision that initially affected the whole page. A new
browser assertion prevents that layout collision returning. Historical
screenshots remain unchanged; the new captures use 27 October filenames.

## Verification

- Production Next build, theme generation, standalone packaging and worker
  bundles passed. The production launcher ran for the browser checks.
- **105 unit tests** passed: 71 assistant/theme/feedback/studio tests and 34
  existing rich-design integrity cases.
- **55 database tests** passed: 30 assistant lifecycle/access/budget cases and
  25 existing rich-design/protected-fact cases.
- **16 distinct browser scenarios** passed across the focused assistant/theme
  run and the later layout/public-discovery run. The final all-theme case passed
  again after collage-detail styling was aligned. Coverage includes all ten
  themes, proposal/draft comparison, interrupted submit reconciliation, initial
  running-state recovery, cancellation, manual variant edits, separate publishing,
  image failures, requester/foreign/anonymous denial, HTML/Flight privacy, saved
  shops, scoped search, public sharing and JavaScript-free refinements.
- Responsive checks exercise 1440, 390 and 320px studio widths; every installed
  theme is checked at 1440 and 390px, plus department/product destinations.
  Horizontal overflow and the configured WCAG A/AA axe checks passed. Screenshots
  were also inspected visually; this is not a full accessibility certification.
- TypeScript, changed-file ESLint, formatting, registry freshness and whitespace
  checks passed. The documentation check resolved 900 local links across 130
  Markdown files. Exact-value secret checks passed over 1,879 built artifacts
  (20 configured candidate values) and the 51 changed/added files (13 configured
  candidate values). These checks do not replace general secret scanning.

Intermediate failures were resolved: budget tests were updated to the exact
higher token/cost reservation counts after the output allowance changed; the
configured daily cap was retained. The original invalid-reviewer, stale-reference,
foreign-access and late-response safety assertions were kept.

The browser/database wrappers created, seeded and dropped disposable local
PostgreSQL databases with fictional accounts and local notification adapters.
No real shop was edited or published, no real email sent and no Render service
or environment setting changed.

### Live provider evidence

[Safe live observations](DESIGN-STUDIO-LIVE-2026-10-27.json) record the initial
provider health result, the field-only failure diagnostic and the corrected
richer contract. The fixed Gemini check reported **919 input / 647 output
tokens**, with a configured **1,894 micro-USD estimate**. This is provider usage
metadata and a configured estimate, not reconciled billing.

OpenAI authentication/access remains unresolved in this execution environment;
its key/project/model access must be corrected separately. The new review
fallback is covered by fixture-backed unit and database cases. It is not a
claim that an authenticated live OpenAI review passed or that Render has the
same credential configuration.

Commands used:

```sh
npm test -- tests/unit/ai-design.test.ts tests/unit/design-feedback.test.ts tests/unit/design-studio.test.ts tests/unit/shop-themes.test.ts
npm test -- tests/unit/p13.test.ts
npm run test:integration -- tests/integration/ai-design.test.ts
npm run test:integration -- tests/integration/p13.test.ts
npm run build
npm run typecheck
npm run test:e2e:core -- design-studio.spec.ts designer-feedback.spec.ts zzzzzzzz-ai.spec.ts storefront-themes.spec.ts --workers=1
npm run test:e2e:core -- design-studio.spec.ts storefront-themes.spec.ts discovery-experience.spec.ts --workers=1
npm run test:e2e:core -- storefront-themes.spec.ts -g 'all installed themes' --workers=1
node scripts/generate-shop-themes.mjs --check
```

The live check enabled `LONDOS_AI_REMOTE=true` for that command only, preserving
local configuration and the configured provider proxy/CA trust:

```sh
npm run ai:verify -- --provider=gemini --studio --require-live
```

## Review captures

All shop names, catalogue items and illustrations below are fictional fixtures.

| View | Desktop | Phone |
| --- | --- | --- |
| Assistant with inline comparison | [1440px](images/design-studio-assistant-1440-2026-10-27.png) | [390px](images/design-studio-assistant-390-2026-10-27.png) |
| Published rich sections | [1440px](images/design-studio-published-1440-2026-10-27.png) | [390px](images/design-studio-published-390-2026-10-27.png) |
| Mosaic | [1440px](images/theme-mosaic-1440-2026-10-27.png) | [390px](images/theme-mosaic-390-2026-10-27.png) |
| Nocturne | [1440px](images/theme-nocturne-1440-2026-10-27.png) | [390px](images/theme-nocturne-390-2026-10-27.png) |
| Botanica | [1440px](images/theme-botanica-1440-2026-10-27.png) | [390px](images/theme-botanica-390-2026-10-27.png) |
| Folio | [1440px](images/theme-folio-1440-2026-10-27.png) | [390px](images/theme-folio-390-2026-10-27.png) |

## Files added or changed

| File | Purpose |
| --- | --- |
| `docs/AI-ENVIRONMENT.md` | Current live-check scope and studio diagnostic command. |
| `docs/BUILD-STATUS.md` | Latest studio evidence and deployment pointer. |
| `docs/DESIGN-STUDIO.md` | Merchant workflow, previews, limits and troubleshooting. |
| `docs/DEVELOPMENT.md` | Current wire/canonical output and token budgets. |
| `docs/STOREFRONT-THEMES.md` | Ten-theme catalogue and section/assistant usage. |
| `docs/evidence/DESIGN-STUDIO-2026-10-27.md` | This verification, capture and file summary. |
| `docs/evidence/DESIGN-STUDIO-LIVE-2026-10-27.json` | Redacted live result metadata, with limitations. |
| `next.config.ts` | Same-origin embedding for the two private preview routes only. |
| `playwright.core.config.ts` | Register the new studio browser suite. |
| `scripts/verify-ai-providers.ts` | Bounded fictional theme-plus-collection live check. |
| `src/app/design-studio.css` | Studio UI, comparison canvas, rich sections and added theme layouts. |
| `src/app/layout.tsx` | Load the scoped design studio stylesheet. |
| `src/components/canonical-shop.tsx` | Single primary hero flow, themed rich/narrative sections and readable panels. |
| `src/components/design-assistant.tsx` | Recovery, local starting points, decisions, preview controls and explicit apply/review state. |
| `src/components/design-proposal-preview.tsx` | Private same-page desktop/phone proposal/draft comparison. |
| `src/components/design-sections.tsx` | Rich variant controls and additional supported section types. |
| `src/components/storefront-hero.tsx` | Collage/poster support and compact identity for an explicit designed hero. |
| `src/modules/ai-design/contract.ts` | Local design recipes, installed theme context and readable proposal summaries. |
| `src/modules/ai-design/design-brief.ts` | Bounded catalogue-backed local design recipes and reference questions. |
| `src/modules/design-feedback.ts` | Safe status-bearing response errors for recovery. |
| `src/modules/shop-design/specification.ts` | Classic theme changes clear conflicting named styling. |
| `src/modules/shop-themes/README.md` | Extended layout vocabulary and renderer style locations. |
| `src/modules/shop-themes/catalogue.ts` | Reviewed collage/poster layout values. |
| `src/modules/shop-themes/colors.ts` | Readable secondary-panel foreground selection. |
| `src/modules/shop-themes/presets/botanica.json` | One added original reviewed theme definition. |
| `src/modules/shop-themes/presets/folio.json` | One added original reviewed theme definition. |
| `src/modules/shop-themes/presets/mosaic.json` | One added original reviewed theme definition. |
| `src/modules/shop-themes/presets/nocturne.json` | One added original reviewed theme definition. |
| `src/modules/shop-themes/registry.generated.ts` | Generated ten-theme registry. |
| `src/server/ai-design/config.ts` | Larger bounded output/wire allowances; existing money cap preserved. |
| `src/server/ai-design/orchestrator.ts` | Retain a validated primary candidate when optional review transport fails. |
| `src/server/ai-design/provider-contract.ts` | Installed themes, strict schema compatibility and new-anchor allocation. |
| `src/server/ai-design/providers.ts` | Context-aware decoding and bounded larger wire intents. |
| `src/server/ai-design/service.ts` | Lightweight read-only polling, request reconciliation and timeout classification. |
| `tests/e2e-core/design-studio.spec.ts` | Inline comparison, recovery, cancellation, references and publication regressions. |
| `tests/e2e-core/storefront-themes.spec.ts` | All-theme coverage and collage layout regression; new captures retain historical images. |
| `tests/integration/ai-design.test.ts` | Review retention, lock-free polling, reference questions and exact updated bounds. |
| `tests/unit/ai-design.test.ts` | Exact reservation expectation for the output allowance. |
| `tests/unit/design-studio.test.ts` | Recipe, provider schema, identity, review and classic theme regressions. |
| Twelve `docs/evidence/images/*-2026-10-27.png` files | New desktop/phone review captures linked above. |

## Deployment

Deploy the latest commit on the same hosted branch. No new environment key,
package, SQL migration or reseed is required. Existing public revisions remain
in place until a merchant explicitly publishes a new saved draft. Correct the
existing OpenAI credential/access separately if independent live review is
required. This update does not reset production credentials or publish shops.
