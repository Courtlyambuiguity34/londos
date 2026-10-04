# Londos Shop Specification (LSS) v0.1

**Status:** Draft architecture contract.

## 1. Purpose

The **Londos Shop Specification (LSS)** is the safe, versioned description of how a merchant's digital shop is organized and presented.

It is the common language between:
- the merchant;
- conversational shop design;
- Londos templates;
- professional designers;
- Shopkeeper;
- the public shop renderer.

A merchant can say:

> “Put new arrivals at the entrance, dresses first, shoes in their own section, and keep WhatsApp visible.”

The conversational designer converts that request into a proposed LSS change. Londos validates it, shows a preview, and only publishes after merchant confirmation.

## 2. What LSS is not

LSS is **not**:
- arbitrary HTML;
- arbitrary JavaScript;
- arbitrary backend code;
- a database dump;
- the merchant's product catalogue;
- the source of truth for prices or stock;
- permission to bypass Londos security/performance rules.

The catalogue remains canonical business data. LSS references safe business objects and describes presentation.

## 3. Fundamental separation

```text
Canonical merchant/business data
  Shop
  Departments
  Products / Services
  Prices / Availability
  Contact / Commerce settings
              |
              v
        Shop Specification
   layout / presentation / references
              |
              v
        Londos Renderer
              |
              v
          Public Shop
```

This prevents a redesign from accidentally changing inventory or financial data.

## 4. Design principles

1. **Safe by construction** — only approved primitives/components.
2. **Merchant-owned intent** — AI proposes; merchant controls publication.
3. **Portable** — specification is not tied to one frontend framework.
4. **Versioned** — old published designs can be restored.
5. **Responsive** — mobile behavior is part of the contract.
6. **Accessible** — components must satisfy platform accessibility rules.
7. **Performant** — tenants cannot create unbounded page weight.
8. **Data-referential** — catalogue objects are referenced by IDs/queries, not copied into layout.
9. **Graceful** — missing products/media/components have defined fallbacks.
10. **Deterministic enough to audit** — a published spec plus canonical data should explain what the renderer intended to show.

## 5. Top-level model

Illustrative structure:

```json
{
  "schema_version": "0.1",
  "shop_id": "SHOP-UG-00000451",
  "design_id": "design_01...",
  "revision": 7,
  "theme": {},
  "navigation": {},
  "entrance": {},
  "spaces": [],
  "floating_actions": [],
  "seo": {},
  "performance": {},
  "extensions": {}
}
```

Exact field names may evolve before implementation.

## 6. Shop spaces

A physical shop has areas. LSS uses **spaces** rather than generic webpage rows.

Initial space types:

- `entrance` — first impression / hero / welcome;
- `display` — curated products/services;
- `department` — gateway into a department;
- `collection` — dynamic curated product set;
- `story` — merchant/about/brand content;
- `offer` — promotion or announcement;
- `contact` — safe merchant contact actions;
- `service_desk` — enquiry/reservation/service action;
- `gallery` — approved media presentation.

The public renderer maps these semantic spaces to responsive UI.

## 7. Approved components

Components are Londos-controlled building blocks.

Examples:
- ShopHero
- ShopLogo
- Heading
- RichText
- ProductCard
- ProductShelf
- DepartmentCard
- DepartmentRail
- CollectionGrid
- PromotionBanner
- Image
- Gallery
- VideoEmbed (approved sources/policy)
- ContactPanel
- WhatsAppAction
- CallAction
- EnquiryAction
- PickupInfo
- DeliveryInfo
- BusinessHours
- LocationCard
- VerificationBadge
- SocialLinks

A component has a versioned schema, safe properties, responsive behavior and performance budget.

## 8. References instead of duplicated data

Bad:

```json
{
  "product_name": "Red Running Shoe",
  "price": 85000
}
```

That can become stale.

Preferred:

```json
{
  "component": "ProductCard",
  "product_ref": "prod_01ABC..."
}
```

At render/query time Londos resolves the current eligible product data.

Dynamic collections can use constrained queries:

```json
{
  "component": "CollectionGrid",
  "source": {
    "type": "product_query",
    "department_ref": "dept_shoes",
    "tags": ["new-arrival"],
    "limit": 8,
    "sort": "merchant_featured"
  }
}
```

The query language is platform-defined and bounded. It is not SQL.

## 9. Entrance

The entrance establishes identity and guides movement.

Illustrative:

```json
{
  "entrance": {
    "style": "editorial",
    "headline": "Annette Fashion House",
    "media_ref": "media_hero_01",
    "primary_destination": "space_new_arrivals",
    "announcement": "New arrivals this week"
  }
}
```

The merchant cannot replace platform-required safety/trust UI through the entrance design.

## 10. Navigation

Navigation is semantic:

```json
{
  "navigation": {
    "mode": "department-led",
    "items": [
      {"label": "Dresses", "department_ref": "dept_dresses"},
      {"label": "Shoes", "department_ref": "dept_shoes"},
      {"label": "Handbags", "department_ref": "dept_bags"}
    ]
  }
}
```

Londos may add required navigation such as accessibility, report/shop status or mall return controls outside tenant customization.

## 11. Theme tokens

Merchants customize identity through bounded tokens rather than unrestricted global CSS.

Illustrative:

```json
{
  "theme": {
    "palette": {
      "primary": "#...",
      "surface": "#...",
      "text": "#..."
    },
    "typography": {
      "heading_family": "approved-font-token",
      "body_family": "approved-font-token",
      "scale": "comfortable"
    },
    "shape": {
      "card_radius": "medium"
    },
    "density": "comfortable"
  }
}
```

The validator checks contrast, supported fonts/tokens and accessibility.

## 12. Responsive behavior

A merchant describes intent; Londos controls safe breakpoints/rendering.

For example, a 4-column desktop product shelf may become 2 columns or a horizontal rail on a narrow phone. Merchants should not need to design every screen width manually.

Advanced designers may specify allowed responsive hints, but cannot violate minimum usability/performance rules.

## 13. Floating commerce actions

Illustrative:

```json
{
  "floating_actions": [
    {
      "type": "whatsapp",
      "contact_ref": "contact_sales",
      "visibility": "shopwide"
    }
  ]
}
```

The contact itself lives in canonical merchant settings. LSS controls where/how an approved action is presented.

Sensitive contact/payment changes therefore do not hide inside design edits.

## 14. Conversational design pipeline

```text
Merchant instruction
       ↓
Intent interpretation
       ↓
Proposed LSS patch
       ↓
Schema validation
       ↓
Policy validation
       ↓
Reference validation
       ↓
Performance/accessibility validation
       ↓
Preview
       ↓
Merchant confirms
       ↓
New design revision
       ↓
Publish
       ↓
Cache invalidation / public render
```

The AI does not directly publish.

## 15. Patch model

Conversational edits should preferably produce constrained operations rather than regenerate the entire specification.

Example conceptual patch:

```json
{
  "base_revision": 7,
  "operations": [
    {
      "op": "move_space",
      "space_id": "space_shoes",
      "before": "space_bags"
    },
    {
      "op": "set_property",
      "target": "space_new_arrivals",
      "property": "emphasis",
      "value": "high"
    }
  ]
}
```

Benefits:
- easier review;
- fewer accidental changes;
- conflict detection;
- clear audit history;
- easier undo.

## 16. Revision model

Each shop can have:
- working draft;
- preview revision;
- published revision;
- revision history.

A revision stores:
- spec/schema version;
- parent revision;
- author (merchant/designer/system);
- change summary;
- timestamp;
- validation result;
- publication state.

Rollback creates a new revision from an older valid state rather than erasing history.

## 17. Professional designer mode

Approved designers use the same LSS contract.

They may get:
- richer layout controls;
- advanced token controls;
- reusable shop sections;
- local preview tooling;
- LSS validation;
- component documentation.

They do **not** receive:
- direct production database access;
- platform secrets;
- arbitrary server execution;
- cross-shop data access.

## 18. Londos Shop SDK

A later SDK can expose:
- LSS schemas;
- component catalogue;
- preview renderer;
- validation CLI/API;
- theme tokens;
- safe data-binding/reference types;
- sample shop specifications.

A custom shop is therefore “custom within the Londos building code.”

## 19. Performance budget

The validator/renderer can enforce:
- maximum above-the-fold media weight;
- maximum number of initial components;
- bounded dynamic collection sizes;
- approved font count;
- video loading rules;
- lazy loading;
- image variant selection;
- animation restrictions;
- no render-blocking tenant script.

Exact budgets require device/network testing.

## 20. Accessibility building code

Londos-owned components should enforce or validate:
- contrast;
- keyboard/focus behavior;
- semantic headings;
- alt-text requirements;
- touch target sizes;
- reduced-motion preferences;
- readable text sizing;
- form labels/errors.

Merchant customization cannot opt out of minimum building standards.

## 21. Safety validation

Reject specifications that:
- reference another shop's private/non-shareable resource;
- reference missing/unauthorized products;
- request unapproved components;
- exceed bounded query limits;
- contain executable script;
- use prohibited external embeds;
- hide required platform disclosures;
- spoof Londos system UI;
- violate shop status/policy.

## 22. Missing-data behavior

A shop must not collapse because one referenced object disappears.

Examples:
- deleted product → omit card and reflow collection;
- missing image → approved placeholder;
- empty collection → hide space or show merchant-defined fallback;
- disabled contact method → action disappears;
- closed shop → tenancy state overrides design and shows platform closure behavior.

## 23. Schema evolution

Every spec declares `schema_version`.

Londos must support:
- validation against known versions;
- migration from older versions;
- deprecation periods;
- component-version compatibility;
- rollback without silently corrupting old designs.

Never mass-break thousands of shops because a frontend component changed.

## 24. Example: Annette

Conceptual abbreviated specification:

```json
{
  "schema_version": "0.1",
  "shop_id": "SHOP-UG-00000451",
  "revision": 7,
  "theme": {
    "preset": "elegant-boutique",
    "density": "comfortable"
  },
  "navigation": {
    "mode": "department-led",
    "items": [
      {"label": "Dresses", "department_ref": "dept_dresses"},
      {"label": "Shoes", "department_ref": "dept_shoes"},
      {"label": "Handbags", "department_ref": "dept_bags"}
    ]
  },
  "spaces": [
    {
      "id": "space_new_arrivals",
      "type": "collection",
      "title": "New Arrivals",
      "emphasis": "high",
      "source": {
        "type": "product_query",
        "tags": ["new-arrival"],
        "limit": 8
      }
    },
    {
      "id": "space_dresses",
      "type": "department",
      "department_ref": "dept_dresses"
    },
    {
      "id": "space_shoes",
      "type": "department",
      "department_ref": "dept_shoes"
    }
  ],
  "floating_actions": [
    {
      "type": "whatsapp",
      "contact_ref": "contact_sales",
      "visibility": "shopwide"
    }
  ]
}
```

The renderer decides the safe responsive implementation.

## 25. Constitutional rule

**Merchants own the arrangement and identity of their premises; Londos owns the building code and renderer.**

That boundary gives Londos both customization and platform safety.
