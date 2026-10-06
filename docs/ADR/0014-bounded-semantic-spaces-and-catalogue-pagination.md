# ADR-0014: semantic shop spaces and catalogue continuation

Status: implemented for P11 local validation, 2026-10-06. Extends [ADR-0005](0005-safe-design-and-canonical-public-reads.md) and [ADR-0013](0013-provider-neutral-conversational-design.md).

## Decision

Integer LSS schema/component version 1 remains compatible with every previously supported `department`, `products`, `story` and `contact` shape. Add the six planned semantic types without arbitrary components, HTML, CSS, URLs, scripts or query expressions. Every space has a unique bounded `id` and `version: 1`.

| Space | Required content and resolution |
|---|---|
| `entrance`, `story`, `offer`, `service_desk` | Title (1–100 characters) and plain body (1–1,000). The service desk adds only canonical enabled contact/enquiry actions. Offers are merchant copy, with no automatic discounts, stock/price changes or financial events. |
| `display`, existing `products` | Title plus one to eight unique owned eligible product IDs. Current canonical prices, availability and normalized media are resolved at read time. |
| `gallery` | Title plus one to four unique owned eligible product IDs with attached ready media and alt text, revalidated before save/application/publication. Render normalized images/captions; unavailable media falls back safely. |
| `department` | Existing owned active department and 1–8 cards, ordered by canonical `(position,id)`. |
| `collection` | Title, owned active department, 1–8 cards, `kind: all/product/service` and `availability: all/available`; filters run before the SQL limit. No arbitrary tags, expressions or sort language. |
| `contact` | Existing saved canonical contact actions and merchant fulfilment/payment instructions. |

Shared limits remain **eight spaces, 32 cards, 7,000 UTF-8 compact JSON bytes, three unique contact actions**. Manual forms, AI intent schema/compiler, current reference validation, preview and public rendering use this same registry. All new generated text is checked by the existing AI text boundary; manually entered text is escaped by React. Publication stays a separately authorized confirmed action. Truthful platform trust labels cannot be supplied by any space. Video/3D, external media embeds, executable designer SDKs and financial/reservation automation remain outside this contract.

The manual picker exposes the first 32 current products plus existing design references (at most 64); reorder/archive in the catalogue to change the bounded selection. Departments remain bounded at 100 and all are reachable. Existing immutable revisions are never rewritten. Unknown future versions retain the established safe empty-layout fallback and canonical navigation/contact information.

## Department continuation

Public department pages use 20 rows plus one lookahead, ordered by `(position,id)`. A bounded canonical base64url cursor binds its schema, shop/department scope, generation, and final sort tuple. It contains public sort positions, no credentials or authorization capability. Forging a public read position cannot grant access; current publication/tenancy/moderation/hold checks run first. Invalid/wrong-scope cursors are 422, changed generations are 409 at the service boundary; the rendered page provides a clear restart link. First/next native links work without client pagination code. Canonical alias redirects preserve validated continuation.

Additive migration **018** introduces one generation row per changed shop. Statement transition-table triggers on products, departments, attachments and media advance once per affected shop per statement, including direct SQL/bulk writes. Missing legacy rows mean generation `0`; no backfill or old-row rewrite is required. Changes and generation increments commit/roll back together. Ordered counter acquisition and atomic upserts serialize concurrent changes; SQL guards reject counter removal/reset and identity rewrites. Read-only repeatable-read transactions keep each page and its generation consistent. A change anywhere in that shop's catalogue conservatively asks an earlier page to restart. Separate shops keep separate counters.

AI context digests include that generation, so changes beyond the bounded context cannot silently apply an earlier proposal. Generation values are decimal strings, preserving PostgreSQL bigint precision. Public reads have a two-second statement deadline. Current generated search vectors stay canonical; internal worker profile projections do not authorize disclosure.

## Rollout and compatibility

Preserve applied 001–017. Apply 018 atomically, then deploy upgraded readers/writers together before offering the extended section forms. An older application can safely use its old LSS/data/job shapes with the additive schema; it cannot render newly introduced semantic types and will use its documented safe fallback. Do not advertise mixed-version full layout fidelity. Keeping expanded schema/data is required for a code rollback; do not reset generation counters or rewrite history. Actual production rolling deployment, roles, CDN and recovery remain P12 gates.

Validation includes old LSS/native commands, unknown-version fallback, tied-position traversal, stale/cross-scope cursors, foreign/archived references, gallery readiness, concurrent counter writes, transaction rollback, interrupted migration/retry, native browser publication and two independent web processes. Read [P11 evidence](../evidence/X2-P11.md) for measurements and external limits.
