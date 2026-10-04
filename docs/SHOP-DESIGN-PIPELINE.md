# Shop Design Pipeline

## Objective

Turn ordinary merchant language into safe, reversible shop-design changes.

## Example

Merchant:

> “Move shoes before handbags and make new arrivals bigger.”

The design service should not regenerate Annette's entire shop blindly.

### 1. Load context

Load only authorized design context:
- current LSS revision;
- public shop metadata needed for design;
- available departments/products/tags;
- component capabilities;
- merchant permissions.

Do not expose unrelated shops or secrets to the design model.

### 2. Interpret intent

Produce a structured intent, conceptually:

```json
{
  "intent": "modify_layout",
  "changes": [
    {"action": "move", "target": "space_shoes", "before": "space_bags"},
    {"action": "emphasize", "target": "space_new_arrivals", "level": "high"}
  ]
}
```

### 3. Compile to LSS patch

A deterministic application layer maps allowed intent to constrained LSS operations.

The AI should not need permission to invent database queries or executable code.

### 4. Validate

Run:
- schema validation;
- shop ownership/reference validation;
- policy validation;
- accessibility checks;
- performance budget;
- component compatibility;
- conflict/base-revision check.

### 5. Preview

Render the candidate revision in an isolated preview.

Merchant can:
- accept;
- reject;
- refine conversationally;
- manually adjust allowed controls.

### 6. Publish

On confirmation:
- create immutable revision record;
- set new published revision atomically;
- invalidate affected public cache;
- record audit/change summary.

## Conflict example

Annette opens Shopkeeper on phone and laptop.

Both start from revision 7.

Phone publishes revision 8. Laptop later tries a patch based on revision 7.

Do not silently overwrite revision 8. Return a conflict and rebase/review the proposed change.

## AI outage

Shop design remains usable through:
- existing published design;
- templates;
- manual approved controls;
- previously saved drafts.

AI is a design assistant, not a runtime dependency for customers entering a shop.

## Model independence

Store LSS, not model-specific output. The AI provider/model can change later without migrating every shop's public design.

## Prompt injection boundary

Merchant catalogue text, product descriptions or uploaded documents may contain hostile instructions. Treat them as data, not privileged system instructions. Tool/data access for the design model must be explicitly scoped.

## Audit

Record:
- actor;
- base revision;
- requested natural-language instruction where policy permits;
- generated structured change;
- validation result;
- accepted/published revision;
- timestamp.

This is valuable for undo, debugging and abuse investigation.
