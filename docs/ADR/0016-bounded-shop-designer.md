# ADR 0016 — Bounded Shop Designer

## Status

Accepted on the pre-Sol completion branch. Full regression and live-provider verification are intentionally deferred to the Sol verification task.

## Decision

Londos treats an AI provider as a design planner, never as a page-runtime or publication authority.

The design path is:

merchant request → provider-neutral `DesignIntent` → Londos validation → deterministic LSS compilation → trusted components → private preview → merchant apply → separately confirmed publication.

The public runtime renders only canonical Londos data and checked-in components. Provider output cannot contain arbitrary HTML, CSS, JavaScript, SQL, URLs, database operations, payment instructions or publication commands.

## Bounded vocabulary

The optional schema-v1 presentation block selects only checked-in tokens for premise style, palette roles, typography, density, content width, navigation and mobile/desktop catalogue columns. Rich sections are limited to hero, featured product, product section, department editorial and commerce information. Existing schema-v1 designs remain valid without a presentation block.

Rich merchant-facing copy carries provenance (`merchant` or `ai`). AI-authored copy is rejected when it asserts a bounded set of stronger factual marketing claims that were not supplied as merchant facts.

## Trust and integrity

Londos validates catalogue identifiers and scoped product/department relationships. A product referenced by a department-scoped section must actually belong to that department. This rule is enforced both by the AI compiler and by the core shop-design service, so direct/manual private APIs cannot bypass it.

Protected contact, payment, fulfilment and delivery facts are included in the authorized context only so the designer can preserve and place them. The intent schema has no operation that can rewrite those facts. Commerce components render the canonical Londos values. Context digests also make a proposal stale when protected shop context changes.

Token combinations must meet bounded contrast checks. Existing LSS byte, section and card budgets remain the performance guardrail.

## Uncertainty and repair

Providers may return structured `design_decision` records. Blocking decisions cannot be combined with layout changes and cannot be applied. The merchant can answer the question in the next conversational request. Invalid provider responses retain the pre-existing bounded repair path and all repaired results pass the same compiler/validation path.

## Provider policy

Gemini remains the primary configured remote designer. OpenAI remains optional fallback/review configuration and is not required for ordinary Gemini proposals or manual design. A future Oracle implementation may satisfy the same logical `AIProvider`/DesignIntent contract and must pass through the identical Londos trust, preview and publication pipeline.

## Publication

Provider output can only become a private proposal. Merchant confirmation applies a validated proposal as a draft. Publication remains a separate, fresh, step-up protected action against the current design revision and existing shop eligibility controls.

## Consequences

Shops can look materially different without arbitrary generated front-end code. Visual quality is implemented in the Londos component library, and provider swaps do not require changing the public rendering or publication authority model.
