# Sol 6.1 High foundation evidence

Date: 2026-10-04. Setting reported by the owner; the assistant cannot verify the model selector. Stage H is the public foundation, not complete platform or production readiness.

## Implemented

- P0 stack reconciliation: ADR-0002 records Next.js / TypeScript / Node / PostgreSQL; ADR-0001 and the old comparison retain history and supersession notes.
- Model recommendations in README and RECOMMENDATIONS; persistent model boundary/reminder in BUILD-STATUS.
- P1 web foundation: exact npm lockfile, strict TypeScript, separated modules/server/UI, CI definition, production standalone packaging/startup and truthful preview health.
- Anonymous fixture entrance, shop-first search, category filters, shop/departments/products, safe missing-route behavior and no-account navigation.
- Six fictional shop records (four open, one closed, one suspended), twelve product/service fixtures, six categories, seventeen local illustrations.
- Read-only Shopkeeper/Management gateways with no private data or actions.
- Accessible navigation/forms, skip link, reduced-motion styling, mobile layout, error/empty/loading components and preview notices.
- Setup instructions, domain-contract draft, Mermaid architecture/journey/model diagrams and checked screenshots.

## Executed checks

| Check | Result |
|---|---|
| `npm ci --no-fund` | Frozen installation succeeded on Node 24.19.0 / npm 11.9.0. |
| `npm run lint` | Passed with zero lint warnings. |
| TypeScript check | Passed; explicit `next typegen` now makes clean-checkout type generation reproducible. |
| `npm test` | 15 tests passed; 0 failed/skipped. These cover the fixture directory/catalogue, not authenticated tenant isolation. |
| `npm run build` | Next 16.3.8 production build and standalone packaging passed. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 16 cases passed across desktop and mobile; 0 failed/skipped. |
| Automated accessibility | No WCAG A/AA violations on the six tested primary routes in each viewport; no horizontal overflow. Manual full accessibility review remains in the plan. |
| `npm audit --omit=dev --audit-level=high` | 0 reported production dependency vulnerabilities at the time of the check. |
| Final `npm audit --audit-level=high` | 0 reported vulnerabilities across both runtime and development dependencies. |
| Documentation and formatting | Local links and formatting are validated by the final stage checks. |

`bash scripts/cloud-install.sh` was exercised with the final dependency graph: frozen installation, checks and standalone packaging all passed. The production server was stopped/restarted and health plus a representative shoes-search response were verified. Reusable cloud install/start instructions were saved as a configuration draft; no publication or new-task restoration is claimed.

The first browser run failed six cases: footer contrast and missing-product HTTP status after premature streaming. Footer text was darkened and the global loading boundary removed. The complete 16-case rerun passed, including explicit HTTP 404 assertions. No assertion was disabled or weakened to make it pass.

The GitHub Actions workflow is prepared but has not been executed remotely. Provider, PostgreSQL, auth/MFA, financial/tenant, scale and recovery tests are unrun because those features belong to subsequent model stages. No application test was replaced by the schema-only validation from onboarding.

## Screenshots

Screenshots were captured from the built standalone preview with Chromium 151, then visually inspected.

- [Mall entrance — desktop](../illustrations/public-preview-desktop.png), 1440-pixel viewport.
- [Mall entrance — mobile](../illustrations/public-preview-mobile.png), 390-pixel viewport.
- [Annette shop — desktop](../illustrations/annette-preview-desktop.png).

## Small-fixture smoke measurements

See [machine-readable measurements](high-preview-measurements.json). Ten sequential local-loopback samples per route used a warm production process and tiny read-only fixtures. This is **not** the 1,500-shop/~150,000-product PostgreSQL benchmark, a real mobile-network test or a capacity claim.

| Route | p50 / p95 response+body | Raw HTML / estimated gzip HTML | Browser JS encoded bytes |
|---|---|---|---|
| Mall entrance | 10.4 / 38.2 ms | 37,388 / 5,995 bytes | 143,294 |
| Shoes search | 8.7 / 13.6 ms | 19,082 / 4,211 bytes | 143,294 |
| Annette shop | 7.9 / 16.9 ms | 25,589 / 4,617 bytes | 143,294 |
| Canvas sneakers | 8.4 / 12.7 ms | 23,756 / 4,256 bytes | 143,294 |

The gzip number is locally estimated compression, not observed HTML wire transfer. Browser resource sizes exclude future merchant photography and external integrations. Initial illustration transfer ranged from 925 to 5,184 encoded bytes on these routes. Rerun full measurements after real persistence, images, search, caching and concurrency exist.

## Open requirements and handoff

- X1 requires Sol 6.1 Extra High: PostgreSQL schema/constraints/migrations; real sessions/MFA/permissions; tenant attacks; transactional durable jobs/outbox.
- The current permission/state document is a draft to implement/review, not a tested security engine. P0 full policy/decision and G0/G1 gates remain open.
- Lint-tool compatibility and an unpatched optional-plugin dependency chain were resolved before handoff: supported ESLint 10, TypeScript/Hooks checks and native platform-element restrictions remain active; the optional Next lint plugin is deferred pending its upstream fix. CI audits the complete dependency graph without ignoring advisories.
- Real contact/application/payment/upload/LSS/AI capabilities and provider bindings are not present. No customer enquiry or rent payment is accepted.
- Production policies, private services, live-provider validation, scale, recovery and release authorization remain in the implementation plan.

**Reminder: Sol 6.1 High foundation work is complete. Switch to Sol 6.1 Extra High and say “Continue X1.”**
