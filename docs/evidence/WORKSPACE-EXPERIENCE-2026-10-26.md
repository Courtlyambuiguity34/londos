# Merchant and landlord workspace experience

Checked on 26 October 2026, on `feature/hosted-lifecycle-secure-2026-10-23`,
continuing from `cf2bae2`.

## What changed

Both private workspaces now carry the public site's cream, forest green and
burnt orange palette, serif page headings, considered spacing and original
illustration. Clear breadcrumbs, task cards with SVG icons, stronger grouping
and compact profile fields make everyday work easier to find. Cards, inputs,
menus and navigation adapt to desktop, tablet and small phones. Public page
styles and the six storefront themes retain their existing behaviour.

The landlord's dashboard keeps real, permission-scoped queues first. Related
tools now sit in balanced groups, rather than a long series of full-width rows.
Development account tools are hidden from its hosted navigation. The underlying
access checks are unchanged. Rent records still require manual verification.

### Finding invitations

Sending and accepting an invitation are separate tasks:

1. An owner chooses **Invite a teammate** on the shopkeeper dashboard, chooses a
   business, then opens its invitation form. Each owned business also has a
   **Manage team** link.
2. Inside a shop, an owner's header shortcut goes directly to that business's
   invitation form. The shop overview includes the same task.
3. The form comes before the team roster. It explains roles, permissions, the
   48-hour invitation expiry and what happens next. Staff need business
   permissions and a grant to each individual shop after accepting.
4. **Received invitations** is now present in every shopkeeper menu, including
   individual shop workspaces. It opens the existing acceptance flow; the
   recipient must open the private email link and use the invited account.

Invites continue through the existing durable notification job. The UI says
*queued*, without claiming delivery. Tokens are not returned by the creation
API. Owner-only management, fresh authentication, exact invited-email matching,
expiry, revocation, version checks and single-use acceptance remain enforced by
the server. Nothing sends real email during the tests below.

### Bugs corrected

- **Expanded mobile menus covered search.** The initial browser regression
  reproduced this before edits. Expanded menus now occupy space in the layout.
  Escape closes the menu and returns focus to its toggle. Workspace search
  remains reachable with the menu expanded.
- **Reopening a just-accepted invitation could race an RSC refresh.** A successful
  acceptance already updates the form and clears its retained bearer. The
  unnecessary background refresh has been removed, and the workspace return
  link disables prefetch to load current server-authorised membership on
  navigation. Reopening the email remains safe and reports an already-used
  invitation rather than accepting it twice.
- **Missing glyphs in controls.** New action arrows and the shared account
  shortcut use SVGs instead of font-dependent arrow characters. The decorative
  motif uses SVG too.

## Verification

The initial focused unit run passed 12 tests. The initial six browser scenarios
produced three passes, a mobile-menu failure, a subsequent fixture collision
when Playwright restarted that failed file, and one skipped scenario. After the
menu correction, all six original navigation/team scenarios passed.

Final verification passed:

- Production build, including theme generation, standalone assets and worker
  packaging; production launcher exercised by the browser suite.
- TypeScript and ESLint for the changed application and regression files.
- **13 focused unit tests** across navigation and theme contracts.
- **6 focused database tests** covering invitation/version boundaries, last-owner
  protection and independently paginated team access; 28 unrelated cases skipped.
- **17 browser scenarios** passed together. After the final role-guidance and
  form-spacing polish, all four new workspace scenarios passed again.
- Formatting, whitespace and documentation links: **128 Markdown files / 879
  local links** resolve. The changed-file exact configured-value scan passed
  across **31 files / 13 distinct candidate values**; it is not a general secret
  or security audit.
- No horizontal overflow and no violations from the configured WCAG A/AA axe
  checks at the exercised widths. Desktop and phone captures reviewed visually.

The broader first review also caught a test locator that included a decorative
plus sign in its accessible name; that locator was corrected without weakening
its owner-only assertion. The invitation replay issue described above was fixed
in the application, with the original security regression retained.

Commands:

```sh
npm run build
npm run typecheck
npm test -- tests/unit/portal-navigation.test.ts tests/unit/shop-themes.test.ts
npm run test:integration -- tests/integration/team-pagination.test.ts tests/integration/p8.test.ts -t 'owner team lists|invitation acceptance|team revisions|independent|invitation pagination'
npm run test:e2e:core -- tests/e2e-core/workspace-experience.spec.ts tests/e2e-core/workspace-appearance.spec.ts tests/e2e-core/invitation-entry.spec.ts tests/e2e-core/team-workflow.spec.ts tests/e2e-core/portal-navigation.spec.ts --workers=1
```

The browser wrapper creates, seeds and drops a disposable database in local PostgreSQL and launches the production server. It uses fictional accounts
and local notification adapters. The tests cover creating a queued invitation
from the visible owner flow, staff and unrelated-team denial, invitation email
entry and replay, profile persistence, publication and uploaded images, scoped
operator/MFA behaviour and navigation. Responsive checks exercise 1440, 900, 390
and 320 pixel widths with horizontal overflow assertions and WCAG A/AA axe checks.
Automated accessibility checks supplement, rather than replace, visual and
keyboard review.

## Review images

All records, contact addresses and counts in these images are fictional test
fixtures. Historical screenshots from earlier work remain unchanged.

| Surface | Desktop | Phone |
| --- | --- | --- |
| Shopkeeper home | [1440 px](images/workspace-experience-merchant-1440-2026-10-26.png) | [390 px](images/workspace-experience-merchant-390-2026-10-26.png) |
| Shop workspace | [1440 px](images/workspace-experience-shop-1440-2026-10-26.png) | [390 px](images/workspace-experience-shop-390-2026-10-26.png) |
| Team and invitations | [1440 px](images/workspace-experience-team-1440-2026-10-26.png) | [390 px](images/workspace-experience-team-390-2026-10-26.png) |
| Landlord dashboard | [1440 px](images/workspace-experience-landlord-1440-2026-10-26.png) | [390 px](images/workspace-experience-landlord-390-2026-10-26.png) |
| Landlord payment form | [1440 px](images/workspace-experience-communications-1440-2026-10-26.png) | [390 px](images/workspace-experience-communications-390-2026-10-26.png) |

## Files

| File | Purpose |
| --- | --- |
| `src/components/workspace-cards.tsx` (added) | Reusable branded welcome and task cards. |
| `src/modules/workspace-links.ts` (added) | Consistent merchant account destinations, with search descriptions. No authority is stored here. |
| `src/components/portal-shell.tsx` | Breadcrumbs, optional page actions, SVG context/account icons, descriptive search items. |
| `src/components/portal-navigation.tsx` | Keyboard Escape recovery for the mobile menu. |
| `src/components/workspace-command-palette.tsx` | Human-readable descriptions and clearer tool-search shortcut. |
| `src/app/workspaces.css` | Shared responsive workspace, forms, cards, dashboard and team styling; mobile menu layout fix. |
| `src/components/account-workspace-shell.tsx` | Shared merchant account links. |
| `src/components/shop-workspace-shell.tsx` | Owner-scoped invitation shortcut and received-invitation navigation. |
| `src/app/shopkeeper/page.tsx` | Merchant dashboard, task cards and owner invitation entry point. |
| `src/app/shopkeeper/shops/[shopId]/page.tsx` | Shop task cards, setup states, owner invite action and compact profile layout. |
| `src/components/profile-form.tsx` | Paired name/category fields, introduction help, save feedback and readable category labels. |
| `src/app/shopkeeper/team/page.tsx` | Business cards with explicit invite/manage actions and staff guidance. |
| `src/app/shopkeeper/merchants/[merchantId]/team/page.tsx` | Full-width team workspace. |
| `src/components/admin-controls.tsx` | Invitation form before roster, permission descriptions, ownership-transfer warning, existing controls and pagination retained; invitation refresh race fixed. |
| `src/app/shopkeeper/invitations/page.tsx` | Clear acceptance card and fresh workspace return navigation. |
| `src/app/landlord/page.tsx` | Grouped management tasks, existing real queues and hidden hosted demonstration-account navigation. |
| `playwright.core.config.ts` | Register the new browser regression file. |
| `tests/e2e-core/workspace-experience.spec.ts` (added) | New invitation, permission, responsive, profile and landlord workflow checks and screenshots. |
| `tests/unit/portal-navigation.test.ts` | Shared merchant navigation contract. |
| This evidence file (added) | Decisions, verification, file summary and review images. |
| `docs/BUILD-STATUS.md` | Link to this completed workspace update. |
| Ten `workspace-experience-*-2026-10-26.png` images (added) | Desktop/phone review captures linked above. |

## Deployment and limits

Redeploy the latest commit on the existing Render service. No new environment
variables, dependency, database migration, secret, reseed or payment integration
is required. Existing permissions and database records remain the source of
truth. No Render deployment, live account change, live invitation or provider
call was performed by these local checks.

This is a focused workspace improvement, not a claim of complete feature parity
with another commerce platform. The invitation backend and mail provider still
need the already-configured worker and email service to deliver real messages.
