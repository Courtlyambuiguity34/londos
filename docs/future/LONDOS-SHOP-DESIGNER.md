# Londos Shop Designer — Post-Release Implementation Brief

**Status:** Deferred implementation brief. Do not interrupt P12/R2/release work to implement this. Preserve the existing P10 AI safety boundary and use this document after the current Londos release candidate is complete.

## Goal

Turn the existing conversational design pipeline into a shop-building system where an AI proposes a **bounded, structured DesignIntent**, and Londos deterministically compiles that intent into a polished responsive shop. The model is the designer/planner; Londos remains the builder, validator, renderer and publication authority.

For the first production iteration, use the existing Gemini provider path. Oracle may later implement the same provider/capability contract without changing the Londos compiler.

## Required architecture

```
merchant language + current authorized shop state
        -> Gemini designer
        -> strict DesignIntent JSON
        -> Londos semantic/integrity validator
        -> deterministic design compiler
        -> private responsive preview
        -> merchant edits/approval
        -> explicit publish
```

Never accept arbitrary model-generated HTML, CSS, JavaScript, database mutations, product facts, prices, payment instructions, delivery claims or publication actions.

## What must be added

### 1. Richer DesignIntent

Extend the bounded design vocabulary only where the renderer genuinely supports it. It should be able to express:

- theme roles: primary, secondary, background, surface, text, accent;
- typography roles/styles, using approved font/style tokens rather than arbitrary remote assets;
- hero variants such as editorial/split/product-led heroes;
- an existing featured product reference;
- merchant-safe headline/subheadline/CTA copy;
- department ordering;
- homepage section ordering;
- approved section variants: featured product, editorial product grid, product grid, product carousel, department editorial, commerce info, delivery/pickup info, contact/banner where supported;
- navigation variants for desktop/mobile;
- density/spacing tokens;
- bounded mobile and desktop product-column choices;
- bounded content-width choices;
- optional presentation hints that cannot alter protected commerce data.

Do not add a component to the AI schema until Londos has a real, tested renderer for it.

### 2. Shop-aware design context

Give the model the minimum authorized structured context required to design accurately:

- shop identity/category and current design;
- existing departments and IDs;
- existing products/services with IDs, names, department membership and safe presentation metadata;
- merchant-design priorities;
- current supported component vocabulary;
- protected-data rules;
- current commerce/contact/delivery/pickup facts only when needed for preserving/displaying them.

The model must reference existing IDs instead of inventing catalogue entities.

### 3. Integrity validator

Before a candidate can become a preview, verify at minimum:

- every product ID exists and belongs to the target shop;
- product/department relationships are valid;
- every component is supported;
- no protected price/product/commerce/contact/delivery/pickup fact was mutated;
- no unsupported factual marketing claim was invented;
- no arbitrary code/URL/script/style injection;
- accessibility/contrast/layout bounds are satisfied;
- candidate still targets the authorized shop and current design revision.

Invalid candidates must be rejected or repaired through the bounded repair path, never silently trusted.

### 4. Deterministic compiler and renderer

Build the visual quality in Londos itself. The same validated intent must always compile to supported responsive components. Implement polished mobile and desktop renderers for the approved component vocabulary, including strong spacing, image handling, typography hierarchy, product cards, navigation and commerce/contact surfaces.

A model response similar to the Amara Collections test should therefore be capable of producing a boutique-quality page without the model writing front-end code.

Merchant-owned product imagery must be preferred. Do not generate fake product photographs as replacements for merchant inventory.

### 5. Preview and publication boundary

AI output remains a private candidate. Show the merchant a real rendered preview and a concise change summary. Publication requires the existing explicit fresh publication action. Provider output must never publish directly.

### 6. Quality/repair loop

Add a bounded design-quality review after compilation. It may identify problems such as overcrowding, weak hierarchy, repeated products, unsuitable mobile density, low contrast or missing merchant information. Repair suggestions must still pass the same validator.

Keep deterministic edits provider-free where possible.

## Reference quality target

The Amara Collections evaluation established the desired class of result:

- cream/burgundy/subtle-gold boutique identity;
- women's shoes prioritized, dresses second;
- existing Kampala Block Heel featured by product ID;
- editorial/airy composition;
- mobile bottom navigation where supported;
- two-column mobile catalogue where appropriate;
- three-column desktop catalogue;
- existing commerce, WhatsApp, delivery and pickup preserved;
- merchant review required.

The important lesson is not those exact colours/components. The lesson is that the model should reason about hierarchy, merchandising, layout and brand direction while Londos enforces truth and builds the page.

## Evaluation gate

Create a repeatable shop-design benchmark containing new-shop design, ugly-shop redesign, protected-data preservation, mobile layout, ambiguous instructions, invalid references, repair, hostile prompts and provider failures.

Score at least:

- schema validity;
- product/department integrity;
- protected-data integrity;
- unsupported-claim rate;
- component validity;
- design quality;
- mobile usability;
- repair success;
- latency/cost.

Include the existing Amara-style scenario as a regression fixture.

## Gemini now, Oracle later

Keep the provider abstraction. Gemini is the initial remote designer. Do not couple the compiler to Gemini-specific response syntax.

Later, Oracle should be able to implement the same logical contract:

```
POST /v1/capabilities/londos/shop-design
authorized shop context + merchant request + allowed schema
    -> DesignIntent
```

Londos must apply exactly the same validation/compiler/preview/publication controls regardless of whether the candidate came from Gemini, OpenAI or Oracle.

## Codex execution instruction

After P12/R2/release work is complete and the owner authorizes this enhancement:

1. inspect the current P10 design architecture and renderer;
2. compare it with this brief and existing safety invariants;
3. implement the smallest coherent schema/compiler/renderer expansion that can reproduce the reference-quality class of shop;
4. add tests before enabling each new component/token;
5. run the full regression/security/tenant-isolation suite;
6. run the shop-design benchmark with Gemini live only when authorized credentials are available;
7. preserve manual editing and existing published shops;
8. document evidence and remaining limitations;
9. commit/push only verified work to the authorized branch.

Do not weaken tenant isolation, protected-data preservation, secret handling, rate/cost controls, provider failure containment or explicit publication.
