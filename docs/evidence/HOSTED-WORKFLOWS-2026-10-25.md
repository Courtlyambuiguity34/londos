# Hosted workflow and interface audit — 25 October 2026

Branch: `feature/hosted-lifecycle-secure-2026-10-23`, based on `c14da3d`.
The working checkout is `/workspace/londos-hosted`; earlier uncommitted branding work in
`/workspace/londos` was preserved. Delegated reviews covered designer, lifecycle/backend,
security, and cross-app forms/navigation. Follow-up validation agents reviewed their work.

## Concrete corrections

| Area | Corrected behavior |
| --- | --- |
| Paid shop visibility | Payment provisions a private shop. Canonical status explains setup, publication, tenancy, moderation and administrative restrictions; public links are offered only for actually public shops. Publishing/unpublishing refreshes the surrounding status and link without a manual page reload. |
| Shop URLs | Newly created shops use readable names; collisions get readable suffixes. Allocations and owner changes coordinate through a transaction lock and immutable address history. Existing URLs are preserved. |
| Hosted address editing | Owners can change addresses with fresh authentication; stale sessions receive guidance. Old eligible links redirect, and aliases cannot be stolen. |
| Workspace organisation | Shop and account tasks are separated; overview groups setup, sharing, primary tasks, profile and optional business tools. Mobile navigation collapses, only one section is current, real brand logo is used, and workspace search traps/restores focus. |
| Restricted staff | Shop listing and navigation reflect the live intersection of merchant and shop permissions. Finance-only and design-only staff land in their granted area, without gaining catalogue/owner/operator authority. |
| Designer feedback | Known validation, access, stale-state, limits and service errors get safe instructions/reference IDs instead of the reported generic fallback. No raw provider/SQL messages are reflected. |
| Design draft safety | Unsaved changes cannot publish/restore/reorder an older saved draft. A failed follow-up refresh does not falsely report a confirmed proposal, apply, manual save or publication as failed. Preview, draft apply and publication stay separate. |
| UGX forms | Policy and invoice inputs store whole shillings; the previous multiplication by 100 is removed. Existing financial records are not automatically changed. |
| Initial invoice safety | Provisioning no longer defeats the initial-invoice uniqueness guard. Scoped finance authority is rechecked after the merchant lock; repeated initial issuance is denied. |
| Payment instructions | Separate MTN/Airtel account details validate in the browser and reach invoices and newly queued tenancy emails. Older optional email payloads remain accepted. Hosted development waivers are denied server-side. |
| Hosted public functions | Normalised ready images, contact pages and enquiry intake work in hosted mode while retaining origin/input/rate/tenant/publication restrictions. A published design pointer is required for contact access. |
| Error recovery and links | Catalogue sections have anchors and an initial-load retry. Malformed application/invoice IDs return 404. Operator invoice links stay within operator routes; initial invoices are not mislabelled renewals. |
| Unsupported hosted reports | Local-only analytics/cost policies stay intact; hosted pages explain unavailability after authorization and navigation does not advertise live reporting. |
| API body deadlines | API body-bearing requests bypass Next middleware buffering so bounded readers start. Spoofed preflight headers do not bypass the deadline; zero-body CORS preflight still checks the configured origin. |
| Build/test drift | Preview-script optional launch settings compile with exact optional types; stale payment fixtures, migration counts and UI labels match the current contracts without weakening security assertions. |

## Actual verification

- All unit tests: **267 passed** in 27 files (`npm test`).
- Broad guarded PostgreSQL verification plus targeted reruns established **313 unique
  integration scenarios across 18 files**. The first broad pass had 291 passed/5 failed;
  stale migration-count and public-contact fixtures were corrected and affected 95 checks
  passed on rerun. Two additional initial-invoice/authorization-race cases passed.
- Compiled hosted-shops/bootstrap/startup-migration/embedded-worker checks: 15 unique passed
  after correcting one stale selector that confused the Management link with Shopkeeper.
  Those 15 are included in the 313 above, not additional counts.
- Production build including TypeScript, standalone assets and worker bundles: **passed**.
- Lint: **passed** after correcting unused imports and the private evidence image component.
- Configured-secret bundle scan: **passed**, 1,839 files/20 exact configured candidate values;
  this does not replace production/repository secret management.
- Browser verification: **63 unique selected scenarios established as passing across the
  complete run and targeted reruns**, including desktop/mobile accessibility/overflow,
  actual shop setup/publication, billing, native MFA, tenant isolation, reporting/appeals,
  private HTML/Flight, slow-body deadlines and CORS. This is not a claim of a single clean
  63-case invocation: that run finished 57 passed/4 failed/2 blocked. See the rerun history below.
- The final production rebuild passed after the publish-banner correction. The extended
  designer scenario (including immediate publish/unpublish banner/link updates) and the
  owner/foreign-tenant security scenario both passed against that final build (**2/2**).
  Final full lint/type generation, final changed-file lint, documentation links, whitespace
  and configured-secret artifact checks also passed. No external-provider test is implied.
- All 78 changed code files passed Prettier. All 116 changed/added files passed an exact
  configured-secret scan; 791 local documentation links resolved across 115 Markdown files.

The integration command selected `p5`, `p6`, `p8`, `p9`, `incidents`, `privacy`, `analytics`,
`costs`, `r2`, `p11`, `p13`, `core`, `ai-design`, `hosted-lifecycle`, then compiled
`hosted-shops`, `bootstrap`, `startup-migration`, `embedded-worker` suites via the existing
`npm run test:integration -- tests/integration/<name>.test.ts` guarded runner. Four fixture
suites and the one compiled navigation assertion were rerun only where failures required it.

## Test corrections and regression boundaries

The first browser pass was intentionally interrupted after exposing failures in the
pre-fix build; it is not a passing run. The focused next pass established 8 of 10 cases,
including whole UGX, public-link/alias behavior, restricted staff, catalogue retry and all
four slow-body/CORS cases. The remaining cases exposed the fresh-session proxy interception
and missing explicit Tab wrapping; these were corrected before the final browser run.
The complete 63-case run then had four stale fixtures: profile-save text on desktop/mobile,
hard-coded layout revision numbers, and an ambiguous trust-case selection. They were fixed
without removing assertions. A seven-case rerun established the save/navigation fixes but
the layout and trust cases lacked the image created by the earlier catalogue scenario.
Including that prerequisite yielded seven passing checks out of eight; its earlier publication
made the security scenario's private-shop precondition false. Running that security scenario
with a fresh isolated database then passed. These fixture-order failures are retained here,
not counted as application passes. The final two-case invocation also verified the last
manual-editor status refresh fix; the other previously passing cases were not repeated.

The targeted invocations were:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- \
  p5.spec.ts security.spec.ts x2.spec.ts zzz-trust.spec.ts mobile.spec.ts portal-navigation.spec.ts \
  -g 'catalogue, contacts, native worker image processing|real owner login|manual templates|anonymous reporting|all eight protected trust|public intake|mobile owner can sign in|shop workspace is organised' \
  --reporter=line
# Above: 7 passed, 1 fixture-order failure. Fresh-database final verification:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- \
  security.spec.ts designer-feedback.spec.ts \
  -g 'real owner login|designer failures' --reporter=line
# Above: 2 passed. These overlap the 63 unique scenarios; do not add their counts.
```

Some new browser fixtures initially deadlocked with a one-connection signup pool; fixture
pools now match the existing three-connection runtime limit. The production limit was not
increased. Historical browser fixtures now explicitly publish before public contact checks
and accept terms before application submission, using real APIs rather than invented flags.

No existing migration file was changed and no new migration was added. Required schema is
still 035. Existing records, aliases, immutable ledger history and external delivery receipts
were not rewritten. No production database, account, credential, live message or AI budget
was used. Tests used isolated loopback PostgreSQL, fictional identities and mocked remote
providers. No expensive unrelated P12 physical recovery/production drill was repeated.

## Operator follow-up

- Deploy this branch using the existing web/worker procedure and retain the same canonical
  database and native MFA configuration. No new environment setting is required by these fixes.
- Review existing rent policies and invoices against agreed terms: the earlier form could
  store 100 times the entered UGX amount. Do not divide or delete financial history blindly.
- For an existing UUID address, the owner can choose an available clean address. Nothing
  automatically changes existing customer links. Duplicate business names require distinct URLs.
- A paid shop still needs a saved, deliberately published design and must satisfy its other
  eligibility restrictions. See [the operator guide](../HOSTED-BILLING-AND-OPERATIONS.md).
- The original production designer error cannot be identified from generic text alone.
  The new safe response/reference makes a future live failure diagnosable without exposing secrets.
- These checks do not establish every possible scenario, all real phones/email clients, live
  provider delivery, production settlement, independent disaster recovery, or formal G5/P13
  launch/pilot completion. Those require their own real evidence and operator review.

## Visual evidence

[Mobile shop workspace](images/shopkeeper-mobile-2026-10-25.png) and
[desktop shop workspace](images/shopkeeper-desktop-2026-10-25.png) use fictional accounts,
a readable allocator-generated address and the production build. The existing named browser
snapshots listed below were regenerated by their regression scenarios. Their historical
filenames do not certify a new G5/pilot release or a live production deployment.

## Complete file inventory

Inventory below distinguishes added and modified files and records the purpose of each.

Total: **116 files** (18 added; 98 modified). No deletions.

### Documentation

| Change | Path | Purpose |
| --- | --- | --- |
| Modified | `docs/BUILD-STATUS.md` | Link current audit; mark older status as historical. |
| Modified | `docs/HOSTED-BILLING-AND-OPERATIONS.md` | Document payment-to-publication, clean links, billing correction and operator actions. |
| Modified | `docs/X2-HANDOFF.md` | Record the current hosted handoff without changing historical release gates. |
| Added | `docs/evidence/HOSTED-WORKFLOWS-2026-10-25.md` | Record findings, actual results, limits, visual evidence and complete inventory. |

### Implementation and build configuration

| Change | Path | Purpose |
| --- | --- | --- |
| Modified | `playwright.core.config.ts` | Include three new hosted workflow/browser suites in desktop verification. |
| Modified | `scripts/preview-email.ts` | Omit absent optional Chromium executable path for exact optional types. |
| Modified | `src/app/api/guest/shops/[shopId]/requests/route.ts` | Enable hosted intake while keeping existing origin, body, rate and publication checks. |
| Modified | `src/app/api/public/shops/[shopId]/media/[id]/[variant]/route.ts` | Enable hosted normalized public media without opening private/source assets. |
| Modified | `src/app/contact/[shopId]/page.tsx` | Enable hosted public contact only for eligible published shops. |
| Modified | `src/app/globals.css` | Responsive grouped workspace panels, mobile menu, search dialog and accessible contrast. |
| Modified | `src/app/landlord/analytics/page.tsx` | Retain scoped access and present hosted reporting unavailability clearly. |
| Modified | `src/app/landlord/costs/page.tsx` | Retain scoped access and present hosted reporting unavailability clearly. |
| Modified | `src/app/landlord/page.tsx` | Organize management tasks and hide unsupported hosted reporting links. |
| Modified | `src/app/landlord/rent/[id]/page.tsx` | Correct initial/renewal labeling, settlement copy and invoice layout. |
| Modified | `src/app/rent-a-shop/page.tsx` | Expose the existing hosted application flow with accurate setup/payment wording. |
| Modified | `src/app/shopkeeper/applications/[id]/page.tsx` | Use shared account shell and scoped safe malformed-ID handling. |
| Modified | `src/app/shopkeeper/applications/new/page.tsx` | Use the shared account shell and remove unused import. |
| Modified | `src/app/shopkeeper/invoices/[id]/page.tsx` | Use shared account shell and scoped safe malformed-ID handling. |
| Modified | `src/app/shopkeeper/page.tsx` | Separate shops/account tools, show canonical eligibility and choose staff-authorized landing links. |
| Modified | `src/app/shopkeeper/shops/[shopId]/address/page.tsx` | Owner-only hosted address workflow with fresh-session guidance. |
| Modified | `src/app/shopkeeper/shops/[shopId]/analytics/page.tsx` | Keep authorization/local-only reporting policy with a safe hosted notice. |
| Modified | `src/app/shopkeeper/shops/[shopId]/costs/page.tsx` | Keep authorization/local-only reporting policy with a safe hosted notice. |
| Modified | `src/app/shopkeeper/shops/[shopId]/design/assistant/page.tsx` | Shared layout, safe IDs and stale-session recovery guidance after shop authorization. |
| Modified | `src/app/shopkeeper/shops/[shopId]/design/page.tsx` | Shared design heading/layout and safe malformed-ID handling. |
| Modified | `src/app/shopkeeper/shops/[shopId]/page.tsx` | Group setup/sharing/tasks/profile and scope management actions. |
| Modified | `src/app/shopkeeper/shops/[shopId]/rent/page.tsx` | Support finance-only staff and validate route/pagination input before queries. |
| Modified | `src/components/admin-controls.tsx` | Readable address-field label and refresh after a confirmed address change. |
| Modified | `src/components/catalogue-workspace.tsx` | Section anchors and recoverable catalogue reload. |
| Modified | `src/components/communications-controls.tsx` | Fix browser phone validation for separate collection networks. |
| Modified | `src/components/create-rent-policy.tsx` | Store/display policy amounts in whole UGX. |
| Modified | `src/components/design-assistant.tsx` | Actionable safe errors and preserve confirmed success when status refresh fails. |
| Modified | `src/components/design-workspace.tsx` | Unsaved-draft safety, safe feedback and immediate publish/unpublish banner refresh. |
| Added | `src/components/hosted-tool-notice.tsx` | Explain authorized but unsupported hosted reporting safely. |
| Modified | `src/components/invoice-list.tsx` | Use actual invoice kind after provisioning attaches the shop ID. |
| Modified | `src/components/issue-application-invoice.tsx` | Store custom/default invoice amounts in whole UGX. |
| Modified | `src/components/lifecycle-controls.tsx` | Network instructions, correct operator invoice links, verified credit wording and safe private image rendering. |
| Added | `src/components/portal-navigation.tsx` | Accessible collapsible portal navigation with one active item. |
| Modified | `src/components/portal-shell.tsx` | Use real branding and shared responsive navigation/search. |
| Modified | `src/components/profile-form.tsx` | Refresh saved shop identity and show accurate confirmation. |
| Modified | `src/components/shop-public-link.tsx` | Show full canonical address; expose live actions only when eligible and offer scoped next steps. |
| Modified | `src/components/shop-workspace-shell.tsx` | Load current status and scope navigation to effective permissions. |
| Modified | `src/components/workspace-command-palette.tsx` | Native modal search, explicit keyboard focus trap and trigger focus restoration. |
| Added | `src/modules/design-feedback.ts` | Allowlisted actionable design errors with safe support references. |
| Added | `src/modules/portal-navigation.ts` | Choose one active navigation destination by longest matching route segment. |
| Added | `src/modules/rent-form-values.ts` | Parse and format whole-UGX form values without multiplying by 100. |
| Added | `src/modules/storefront-status.ts` | Derive storefront status from publication, tenancy, moderation, pause and published pointer. |
| Modified | `src/proxy.ts` | Preserve bounded API body handling and allow safe stale-session recovery landing pages. |
| Modified | `src/server/administration.ts` | Permit guarded hosted owner address changes with the shared allocation lock. |
| Modified | `src/server/applications.ts` | Remove an unused security import; existing application guards remain. |
| Modified | `src/server/bootstrap-accounts.ts` | Allocate readable initial shop addresses with reservation protection. |
| Modified | `src/server/contacts.ts` | Require a published design for publicly eligible contact/intake. |
| Modified | `src/server/jobs/adapters.ts` | Validate optional paired MTN/Airtel fields while accepting older queued payloads. |
| Modified | `src/server/jobs/brevo.ts` | Render separate MTN/Airtel instructions without duplicate legacy mobile-money lines. |
| Modified | `src/server/rent.ts` | Readable provisioning, initial-invoice deduplication and lock-time reauthorization; safe hosted credit modes and network notice fields. |
| Added | `src/server/shop-address.ts` | Normalize names and reserve available readable addresses under a transaction lock. |
| Modified | `src/server/workspace.ts` | Canonical storefront status and live effective staff permissions. |

### Unit tests

| Change | Path | Purpose |
| --- | --- | --- |
| Added | `tests/unit/design-feedback.test.ts` | Eleven safe feedback/reference cases. |
| Added | `tests/unit/portal-navigation.test.ts` | Two active-route/segment-boundary cases. |
| Added | `tests/unit/rent-form-values.test.ts` | Ten whole-UGX parsing/formatting cases. |
| Added | `tests/unit/shop-storefront.test.ts` | Four storefront eligibility and optional email-payload cases. |

### Integration tests

| Change | Path | Purpose |
| --- | --- | --- |
| Modified | `tests/integration/ai-design.test.ts` | Use actual migration-file inventory while retaining checksum/data preservation assertions. |
| Modified | `tests/integration/analytics.test.ts` | Use actual migration-file inventory while retaining checksum/data preservation assertions. |
| Modified | `tests/integration/costs.test.ts` | Use actual migration-file inventory while retaining checksum/data preservation assertions. |
| Added | `tests/integration/hosted-lifecycle.test.ts` | Eight real hosted lifecycle, billing, address-race, tenant/staff and email-renderer scenarios. |
| Modified | `tests/integration/hosted-shops.test.ts` | Compiled normalized media/contact/intake isolation and publication checks. |
| Modified | `tests/integration/p11.test.ts` | Use actual migration-file inventory while retaining checksum/data preservation assertions. |
| Modified | `tests/integration/p5.test.ts` | Publish a real saved fixture design before anonymous contact assertions. |
| Modified | `tests/integration/p8.test.ts` | Use current payment-network and claim method fixtures. |
| Modified | `tests/integration/p9.test.ts` | Use actual migration-file inventory while retaining checksum/data preservation assertions. |
| Modified | `tests/integration/privacy.test.ts` | Use dynamic migration inventory and a deliberately published guest-contact fixture. |

### Browser tests

| Change | Path | Purpose |
| --- | --- | --- |
| Modified | `tests/e2e-core/audit.spec.ts` | Current setup guidance/mobile menu with existing accessibility, overflow and tenant checks. |
| Added | `tests/e2e-core/designer-feedback.spec.ts` | Safe designer failures, refresh outcomes, unsaved edits, immediate public status updates and stale-session fences. |
| Modified | `tests/e2e-core/mobile.spec.ts` | Current profile-save confirmation while preserving real mobile edit/security checks. |
| Modified | `tests/e2e-core/p5.spec.ts` | Deliberately save/publish before public-contact checks and enable enquiries in the abuse fixture. |
| Modified | `tests/e2e-core/p8.spec.ts` | Current native-MFA/layout labels and mandatory terms/payment-policy fixtures. |
| Added | `tests/e2e-core/portal-navigation.spec.ts` | Responsive/accessible navigation, modal focus, public links/aliases, stale owner edits and staff scopes. |
| Modified | `tests/e2e-core/security.spec.ts` | Current save/navigation labels plus real stalled-body variants and zero-body CORS checks. |
| Added | `tests/e2e-core/shopkeeper-workflows.spec.ts` | Actual whole-UGX invoice/policy forms, payment-network validation, staff denial and catalogue retry. |
| Modified | `tests/e2e-core/x2.spec.ts` | Assert exact version/revision increments relative to its actual baseline and restore its own saved layout. |
| Modified | `tests/e2e-core/zz-admin.spec.ts` | Current team-navigation and address field labels. |
| Modified | `tests/e2e-core/zzz-trust.spec.ts` | Current report confirmation and exact submitted report/case targeting. |
| Modified | `tests/e2e-core/zzzzz-analytics.spec.ts` | Current enquiry button and operator analytics heading. |
| Modified | `tests/e2e-core/zzzzzzz-costs.spec.ts` | Current management heading without dropping costs checks. |

### Regenerated regression images

| Change | Path | Purpose |
| --- | --- | --- |
| Modified | `docs/evidence/images/g5-demo-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/g5-demo-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Added | `docs/evidence/images/shopkeeper-desktop-2026-10-25.png` | Current fictional desktop/mobile workspace evidence. |
| Added | `docs/evidence/images/shopkeeper-mobile-2026-10-25.png` | Current fictional desktop/mobile workspace evidence. |
| Modified | `docs/evidence/images/x2-catalogue-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-design-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-guest-contact.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p10-assistant-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p10-assistant-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p10-proposal-preview.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p11-catalogue-core-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p11-catalogue-core-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p8-application-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p8-operations-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p8-rent-ledger.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p8-team-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p8-team-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-analytics-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-analytics-operator-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-analytics-owner-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-costs-journal-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-costs-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-costs-owner-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-incident-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-incident-owner-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-incident-review-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-privacy-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-privacy-owner-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-privacy-review-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-report-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-report-mobile.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-p9-review-desktop.png` | Regenerated fictional regression snapshot; historical filename retained. |
| Modified | `docs/evidence/images/x2-public-product.png` | Regenerated fictional regression snapshot; historical filename retained. |
