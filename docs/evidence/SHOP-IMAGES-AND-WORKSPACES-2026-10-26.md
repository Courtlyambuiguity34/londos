# Shop images and workspace usability — 26 October 2026

Date: Africa/Kampala. Branch: `feature/hosted-lifecycle-secure-2026-10-23`.
Baseline: `02332c8923717e54adcb60f9e08efd898be6e5f8`. Earlier work was preserved.

## Findings and corrections

The database-backed mall card rendered only text. Its discovery response had no
image metadata, even when a merchant had ready product images. The preview-only
illustrated card did have artwork; changing that component alone would not fix
the live mall. Uploads also had no explicit shop-cover/logo assignment.

The fix selects a published cover first, then a ready image assigned to a
non-archived product in an active department. A deliberate icon/initial replaces
the previously empty image region when neither exists. Category, product and
shop-specific searches retain their exact destinations and visibility rules.

Optional cover/logo asset IDs now live in the existing versioned shop design.
Old specifications retain their exact parsed shape when branding is absent.
Ready images must belong to that shop and merchant, have a description and
dimensions, and have all three normalized public variants. Arbitrary URLs,
foreign assets, unfinished uploads and missing variants are rejected.

The owner chooses images in **Design & publish**, saves, previews privately and
publishes explicitly. Draft replacements do not change the public cover. The
storefront renders the chosen cover/logo; public media permits published branding
as well as current eligible product assignments. Original/quarantined variants
remain inaccessible. Deletion protects the current draft/published branding, and
historical restoration revalidates references. Design-assistant theme changes
preserve selected branding. Upload and designer shortcuts respect staff grants.

Both workspaces use the existing forest green, cream, orange and brand artwork.
The new scoped stylesheet replaces the visual conflicts in the shared portal
surfaces: grouped sidebar, calmer top bar, consistent panels/forms, smaller
section headings, actual shop/queue counts, and a mobile shortcut dock/full menu.
Landlord operational groups remain available; secondary account/job details are
expandable. No orders, analytics, trend percentages, revenue or charts are
invented to reproduce decorative reference data. Public browsing retains its
existing layout apart from corrected cards, image presentation and singular count.

## Verification actually executed

All writes used guarded disposable loopback PostgreSQL databases and fictional
accounts. The production build and Chromium browser exercised the real routes,
not a static mock-up. No production database or remote provider was mutated.

| Check | Final result |
| --- | --- |
| Unit: `shop-branding`, `design-feedback`, `portal-navigation` | **16 passed**: legacy shape compatibility, ID-only branding, assistant preservation and existing navigation/feedback contracts. |
| Selected `p6` integration scenarios | **8 passed, 16 skipped**: three new branding/discovery cases and five relevant publication/media/search/cursor/deadline regressions. Skips are not passes. |
| Selected production browser scenarios | **5 passed**: three new appearance/image cases, existing publish/address/redirect case, and finance-only/design-only staff case with an added grant-aware image shortcut assertion. |
| Production build | Passed: Next/TypeScript, standalone assets and independent worker/bootstrap/migrator bundles. |
| Full ESLint, TypeScript and changed-code formatting | Passed. |
| Whitespace, local documentation links and configured-secret scans | Passed; exact scope/counts are recorded below. |

Integration command:

```sh
npm run test:integration -- tests/integration/p6.test.ts -t 'shop branding|shop discovery falls|publication needs fresh|unpublish and moderation|exact product search|cursor pages are bounded|search has a real'
```

Browser command:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- workspace-appearance.spec.ts portal-navigation.spec.ts -g 'merchant dashboard|uploaded shop image|landlord dashboard|publishing activates|finance-only' --reporter=line
```

The appearance cases visit merchant dashboard, shop overview, catalogue,
designer, landlord dashboard and scoped operations at **1440, 900, 390 and 320**
CSS pixels. Each checked page has no horizontal document overflow and no
automated WCAG A/AA/2.1 AA violations. Mobile menu/dock navigation works. Real
operator MFA enrollment is required; an ordinary merchant remains denied the
operator API and the operator remains denied an unrelated shop workspace.

The image browser case uploads an actual PNG through the UI, runs its normally
leased image-processing job, waits for the private thumbnail, selects cover/logo,
saves, verifies private preview image decoding, explicitly publishes and verifies
the decoded image on the main mall and storefront. Unpublishing removes the
listing and returns 404 from its public image route. Integration also verifies
all three WebP variants, source/quarantine denial, cross-shop/tenant denial,
draft/published replacement isolation, active-reference deletion protection,
stale saves, product-image fallback and department/product/moderation/tenancy gates.

Early focused runs exposed a pre-existing pagination test dependency on prior
tests' published shops. The test now supplies its own second eligible result;
the final selected run passes independently. During construction, browser
assertions were corrected to match the actual page heading, established HTTP403
operator denial and browser density-adjusted image width. A restarted worker's
fixture uses a distinct readable address, respecting the real collision rule.
Those failed intermediate runs are not represented as passes. Private logs and
failure traces stay ignored; only final fictional-data screenshots are committed.

## Screenshots

- [Shopkeeper desktop](images/workspace-shopkeeper-1440-2026-10-26.png)
  and [phone](images/workspace-shopkeeper-390-2026-10-26.png).
- [Catalogue desktop](images/workspace-catalogue-1440-2026-10-26.png)
  and [phone](images/workspace-catalogue-390-2026-10-26.png).
- [Designer desktop](images/workspace-design-1440-2026-10-26.png)
  and [phone](images/workspace-design-390-2026-10-26.png).
- [Landlord desktop](images/workspace-landlord-1440-2026-10-26.png)
  and [phone](images/workspace-landlord-390-2026-10-26.png).
- [Published mall cover desktop](images/mall-shop-cover-desktop-2026-10-26.png)
  and [phone](images/mall-shop-cover-mobile-2026-10-26.png).

The plain orange test image is a generated PNG fixture, not a claim to be the
merchant's real photo. Local-development notices in those screenshots reflect
the isolated test configuration. This work does not enable that mode in Render.

## Deployment and limits

Redeploy the current hosted branch and follow [shop image instructions](../SHOP-APPEARANCE.md).
No new migration, environment variable or package is required. Existing schema
036 readiness, PostgreSQL authority, optional MongoDB/Cloudinary/Redis flags,
worker configuration, financial records and shop URLs are unchanged.

The specific image in the owner's live database was not inspected or reassigned.
An existing ready product assignment gains a mall card automatically. A private
library upload requires explicit cover selection and publication. No successful
Render rollout, real-phone/manual assistive-technology audit, live provider
health or exhaustive app-wide verification is claimed. Previously passed broad
suites and unrelated recovery drills were not rerun.

## File inventory

**39 files: 22 modified and 17 added; no deletions.**

| Status | File | Purpose |
| --- | --- | --- |
| Modified | `docs/BUILD-STATUS.md` | Point current work to this evidence and image guide; preserve history. |
| Modified | `docs/X2-HANDOFF.md` | Record current continuation base and preserved migration036. |
| Added | `docs/SHOP-APPEARANCE.md` | Explain upload/cover/publish, navigation, permissions and deployment. |
| Added | `docs/evidence/SHOP-IMAGES-AND-WORKSPACES-2026-10-26.md` | Record findings, actual verification, limitations and inventory. |
| Added | Ten `docs/evidence/images/*-2026-10-26.png` files linked individually above | Record final fictional desktop/phone views; earlier evidence images remain unchanged. |
| Modified | `playwright.core.config.ts` | Register the new focused browser file. |
| Modified | `src/app/landlord/page.tsx` | Group navigation and simplify secondary account/job information. |
| Modified | `src/app/layout.tsx` | Load the new scoped stylesheet after existing styles. |
| Modified | `src/app/shopkeeper/page.tsx` | Add actual accessible-shop summaries and clearer introduction. |
| Modified | `src/app/shopkeeper/shops/[shopId]/catalogue/page.tsx` | Supply effective design capability to image guidance. |
| Added | `src/app/workspaces.css` | Consistent branded responsive portal surfaces and public image presentation. |
| Modified | `src/components/account-workspace-shell.tsx` | Keep grouped landlord navigation consistent and grant-aware on subpages. |
| Modified | `src/components/canonical-directory.tsx` | Render authorized shop images/fallbacks and singular shop count. |
| Modified | `src/components/canonical-shop.tsx` | Render saved/published cover and logo in their correct preview/public context. |
| Modified | `src/components/catalogue-workspace.tsx` | Explain assignments/publication, respect design links and deletion constraints. |
| Modified | `src/components/design-workspace.tsx` | Integrate branding selection and organize related help links. |
| Added | `src/components/portal-icon.tsx` | Supply consistent navigation icons. |
| Modified | `src/components/portal-navigation.tsx` | Group permitted links and provide mobile shortcuts/menu controls. |
| Modified | `src/components/portal-shell.tsx` | Use existing dark logo, shop context and consistent heading/banner order. |
| Modified | `src/components/shop-workspace-shell.tsx` | Separate shop, subscription and account navigation without broadening access. |
| Added | `src/components/shop-branding-fields.tsx` | Accessible ready-image selectors, previews and grant-aware upload guidance. |
| Modified | `src/modules/shop-design/specification.ts` | Add optional strict branding references, retaining legacy compatibility. |
| Modified | `src/server/discovery.ts` | Resolve only ready published covers or eligible product-image fallbacks. |
| Modified | `src/server/media.ts` | Prevent deletion of active draft/published branding assets. |
| Modified | `src/server/public-shop.ts` | Resolve scoped branding metadata and gate normalized public bytes. |
| Modified | `src/server/shop-design.ts` | Validate owned normalized references and expose safe designer choices/capability. |
| Modified | `tests/e2e-core/portal-navigation.spec.ts` | Extend the existing staff case to reject an ungranted upload shortcut. |
| Added | `tests/e2e-core/workspace-appearance.spec.ts` | Verify real upload/publication and responsive/MFA/role behavior. |
| Modified | `tests/integration/p6.test.ts` | Add three branding cases and make pagination independent of execution order. |
| Added | `tests/unit/shop-branding.test.ts` | Verify legacy shape, safe reference input and assistant preservation. |

Final static detail: all **25 changed code files** pass Prettier; **817 local
links across 119 Markdown files** resolve. The configured-value artifact scan
passes for **1,844 files / 20 candidate values**; the changed-file scan passes
for **all 39 files / 13 distinct configured candidate values**, including the
new screenshots. These exact-value scans are bounded checks, not a substitute
for an independent production security review. Final full lint, TypeScript and
`git diff --check` also pass.
