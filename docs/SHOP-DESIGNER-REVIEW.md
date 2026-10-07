# Shop-designer instructions and branch review

Reviewed on 2026-10-07 during provider integration work, without overwriting either implementation branch.

## Sources inspected

- Current branch: `codex/londos-x2-2026-10-05`, starting at `2b7258fa1842759f28770e55c1f620be18bc1265`.
- [Future designer brief](future/LONDOS-SHOP-DESIGNER.md): bounded structured intent, supported deterministic renderer, shop-scoped references, protected facts, private preview, explicit merchant apply/publication, bounded repairs, Gemini-first/provider-neutral policy.
- Separate remote branch: `codex/londos-pre-sol-completion-2026-10-07`, inspected at `0e9879829ead8e818a52f5674d7c385f94e57855`.
- That branch's `docs/ADR/0016-bounded-shop-designer.md`, `docs/evidence/P13-IMPLEMENTATION.md`, `tests/fixtures/shop-designer-amara.json` and Amara unit regressions in `tests/unit/ai-design.test.ts`.

No AGENTS.md or additional feature-folder agent instruction/result file was found in the checked current/main/pre-Sol trees. The Amara JSON is a regression scenario, not a live provider transcript or executed-results report. The pre-Sol implementation record explicitly defers independent full verification; reading it does not establish its tests passed.

## What remains protected here

The current branch already enforces P10's private proposal, checked specification, manual apply and separate fresh publication action. This task does not expand the AI schema, grant provider mutation authority, weaken tenant access, change commerce facts or enable remote AI. Public provider copies contain allowlisted catalogue metadata and normalized merchant images, never arbitrary AI output or private accounts/evidence.

The separate branch contains a richer schema/compiler/renderer, provenance, contrast checks, structured design decisions and an Amara fixture. Its tests include rejecting Accessories product P104 from a Handbags-scoped section and rejecting stronger invented marketing claims. Those changes have been preserved on their existing branch; they were not recreated or claimed verified here.

## Consolidation before comprehensive Sol verification

The branches diverged from P12. The current branch's **019_release_delivery_and_demo_cohort.sql** is already applied and immutable. The other branch adds a different **019_shop_designer_intent.sql** and changes the required schema. Do not replace the applied 019, switch a running database onto that branch's migration set, or overwrite current Brevo/demo/provider/pilot evidence with the other branch's older baseline.

A reviewed consolidation must preserve both features, keep current 001–019 byte-identical, express designer additions as a new migration, reconcile schema/readiness and role/recovery contracts, retain historical reports and validate all merged runtime paths. Then Sol should run the comprehensive unit/integration/security/browser/migration suite and the supported design benchmark; live Gemini only with available authorized credentials. That consolidation is a separate pending scope choice, not a completed gate in this provider task.

Also complete the real Atlas connection/CRUD check once MONGODB_URL reaches the runtime, real Cloudinary/Brevo provider acceptance, and the remaining G5 live deployment obligations. Never reinterpret mock success, a fixture or a source-only implementation record as live launch evidence.
