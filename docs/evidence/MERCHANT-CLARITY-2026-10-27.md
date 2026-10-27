# Merchant catalogue and page-builder clarity

Checked 27 October 2026, continuing from `9054bc4` on
`feature/hosted-lifecycle-secure-2026-10-23`.

The initial relevant baseline passed 48 unit tests and nine browser scenarios.
The review found raw position numbers, minor-unit price entry, a product form
below the product list, internal section/layout names, and unclear navigation
between home-page sections and department/product pages.

## Changes

- Added a permission-aware **Add product** shop-header action, catalogue task
  shortcuts and **Add product to …** on each active department. The department
  selection follows that shortcut, and the form moves above the product list.
- Optional link/type settings fold away. Blank addresses are derived from names;
  existing addresses and server uniqueness checks remain. Raw numeric order
  fields are hidden, preserving existing values on edits.
- Prices use ordinary currency amounts with exact string/BigInt conversion to
  existing database units. Blank remains ask-for-price. Invalid formats, fractional
  UGX and overlarge values are rejected without a write. Editing preserves the
  amount without floating-point rounding or multiplying it again.
- Product-photo guidance links to the existing image workflow while entered
  product details remain mounted when switching tabs. A successful image upload
  no longer clears an existing product edit: department/product forms reset
  after their own successful save, rather than after unrelated image work.
- Section cards use merchant labels and department names instead of internal
  types or fallback identifiers. Department sections expose friendly product
  counts, department selection and a saved private-preview page link.
- Added explicit department-page links to published/private department previews.
  Existing view-link helpers preserve private revision/proposal identity and
  published paths. Welcome/story/contact sections stay on the home page.
- Simplified appearance, spacing, lettering and per-row choices. The phone save
  bar stays in the page flow instead of covering section controls.
- Added the [shopkeeper quick start](../SHOPKEEPER-QUICK-START.md).

## Verification

50 unit tests pass, including exact ordinary-price conversion, maximum-value
round trips, invalid-price rejection and readable name-based addresses. The 25
existing rich-design database tests also pass.

All 23 distinct browser scenarios passed across the focused runs, including the
final eight-scenario catalogue/image/access run. The production build, production
launcher, TypeScript, changed-file ESLint, formatting, whitespace and documentation
link checks passed. The configured-value bundle scan passed; it checks exact
configured values and is not a general secret-scanning certification.

Browser coverage includes a merchant creating Crops by name, adding Maize seed
inside it, typing a USD amount, switching to Images without losing the entered
details, uploading a real fictional image while editing an existing product,
saving the retained description and exact price, adjusting plain-language phone layout choices,
adding home-page sections, previewing department/product pages and separately
publishing them. Desktop and 390/320px checks cover overflow and configured WCAG
A/AA axe rules. Automated axe results are not a full accessibility certification.

Existing checks cover create/reset/conflict feedback, private media and catalogue
navigation, image upload/worker processing, anonymous/foreign denial, catalogue
pagination, plain-text section rendering, all ten themes and assistant recovery.
The new merchant scenario's implicit-select test locator was corrected to use
the actual accessible combobox name; the complete journey passed on the final
build. Native worker image processing and anonymous/foreign access checks were
also rerun after the form-reset fix.

Commands:

```sh
npx vitest run tests/unit/merchant-editor.test.ts tests/unit/p13.test.ts tests/unit/shop-themes.test.ts
npm run test:integration -- tests/integration/p13.test.ts
npm run build
npm run test:e2e:core -- catalogue-feedback.spec.ts storefront-themes.spec.ts design-studio.spec.ts p5.spec.ts p11.spec.ts p5-mobile.spec.ts --project=core-desktop --project=core-mobile
npm run typecheck
npm run check:docs
npm run check:bundle-secrets
```

All accounts, shops and database writes in these runs are fictional and confined
to disposable local PostgreSQL databases. No production shop, account, API key,
email, Render setting or database schema is changed. Historical images generated
by older tests are restored; the three new captures below record this work.

## Captures

- [Product form, desktop](images/merchant-clarity-products-1440-2026-10-27.png)
- [Product form, phone](images/merchant-clarity-products-390-2026-10-27.png)
- [Named sections, narrow phone](images/merchant-clarity-sections-320-2026-10-27.png)

## File summary

| File | Purpose |
| --- | --- |
| `src/modules/merchant-editor.ts` | Merchant labels, address generation and exact currency input conversion. |
| `src/components/catalogue-workspace.tsx` | Product/department shortcuts, form placement, optional settings and ordinary prices. |
| `src/components/shop-workspace-shell.tsx` | Permission-aware header product shortcut. |
| `src/components/design-workspace.tsx` | Plain appearance choices, page explanation and permitted catalogue shortcuts. |
| `src/components/design-sections.tsx` | Named sections/layouts, editable department previews and private page links. |
| `src/components/canonical-shop.tsx` | Explicit full-department links in department/collection previews. |
| `src/app/editor-workflows.css` | Merchant guidance panels, optional settings and phone save-bar flow. |
| `tests/unit/merchant-editor.test.ts` | Exact money and readable-address regressions. |
| `tests/e2e-core/catalogue-feedback.spec.ts` | Full merchant journey, optional-form handling, new price labels and captures. |
| `tests/e2e-core/design-studio.spec.ts` | Use the friendly welcome-banner label in the existing workflow. |
| `tests/e2e-core/p5.spec.ts` | Exercise optional address settings and ordinary price/photo fields. |
| `tests/e2e-core/p11.spec.ts` | Use the current section/review tabs and friendly section chooser. |
| `docs/SHOPKEEPER-QUICK-START.md` | Step-by-step merchant workflow. |
| `docs/BUILD-STATUS.md` | Latest guide and evidence pointer. |
| `docs/evidence/MERCHANT-CLARITY-2026-10-27.md` | Findings, verification and changed-file record. |
| `docs/evidence/images/merchant-clarity-products-1440-2026-10-27.png` | Desktop product-form capture. |
| `docs/evidence/images/merchant-clarity-products-390-2026-10-27.png` | Phone product-form capture. |
| `docs/evidence/images/merchant-clarity-sections-320-2026-10-27.png` | Narrow-phone section editor capture. |

## Deployment

Deploy the latest hosted-branch commit. No new environment variables, dependency,
migration or reseed is required. Existing saved/published designs and routes stay
in place. Publish a new draft only when you choose to change the shop's content.
