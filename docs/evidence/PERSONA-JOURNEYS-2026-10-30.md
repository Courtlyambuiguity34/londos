# Easier shop setup, photo completion and application review

Baseline: `6f3065b` on `feature/hosted-lifecycle-secure-2026-10-23`.

## Findings and decisions

The user's missing department/product photos exposed workflow gaps. Product
images were uploaded in a separate Images tab and needed a second manual
selection back in the product editor. Saving did not clearly distinguish an
unfinished product from one ready for customers. Departments have no separate
image field: their thumbnails come from product photos. The storefront only
looked for those photos among the products loaded on the home page, so a valid
photo later in a department could be missed.

The preceding [merchant comparison](MERCHANT-WORKFLOWS-2026-10-29.md) documents
Shopify, Amazon and Alibaba sources. This follow-up applies its lessons to the
actual Londos journeys rather than adding their larger listing forms. It is a
code and browser review, not a timed study with first-time merchants. These
changes do not establish platform parity or a measured conversion advantage.

## Shopkeeper journey

- Normal **Add product** links open a focused **Photo & name → Details → Review
  & save** flow. A department's link preserves its selection and rejects an
  inactive or foreign department. The full catalogue editor remains available.
- A photo can be selected directly from the product form. The existing upload,
  validation and background-processing pipeline prepares it, and the ready
  photo attaches automatically. The file chooser comes before the preview;
  selecting an existing image is an optional disclosure.
- Failed or slow uploads show a clear status and retain the entered product
  details. Replacing an image clears the previous selection before upload, so a
  failed replacement cannot silently save the previous photo as the new one.
- The guided server endpoint requires a complete ready photo for a visible
  physical product. **Add the photo later** permits an explicit hidden save;
  services can remain without a photo. Normal catalogue ownership, version,
  exact-price, storage and history checks still apply.
- Departments can be created inside the flow. Optional description/link fields
  stay behind More details. Saving another product preserves department,
  currency and type, with an empty name and photo. Step headings receive focus,
  and leaving a modified guided form warns about losing unsaved details.
- Shop overview and catalogue warnings count missing photos across the complete
  active catalogue and provide direct repair links. A department warning
  explains how its thumbnail is supplied. Hidden/deleted products and archived
  departments are excluded from current-listing counts; services do not require
  photos, although their department can still lack a thumbnail.
- Review & publish lists outstanding photo gaps. Publication checks the current
  catalogue under the existing merchant lock. The merchant must fix the gaps or
  explicitly acknowledge them before publishing. Acknowledgement does not bypass
  tenancy, moderation, permissions, fresh authentication or design validation.

The full editor and its existing API retain deliberate text-only catalogue
support. Existing live catalogues are not automatically hidden or changed.
Warnings and publication review make those gaps visible; the new normal guided
entry is stricter about visible physical products. Unsaved form fields are not
persistent drafts; a product is persisted only after a confirmed save.

## Application and landlord journeys

The application page can now collect business details and one private verification
photo, save the draft, upload evidence with the current version and submit for
review in one action. **Create application draft** remains available. If a later
step fails, the confirmed draft is linked for continuation and the form prevents
another creation. Business fields freeze while processing and after partial
completion so edited values cannot appear to have been saved when they were not.
Status copy explains the next stage.

Private verification photos remain separate from public product photos. Approval
and verified rent coverage still precede shop provisioning. This update does not
allow stocking an unprovisioned shop, bypass verification or guarantee an approval
or setup duration. Authentication and legal consent requirements remain.

The landlord review queue has business-name and status filters applied before
pagination, report counts for submitted/reviewing/waiting-for-applicant records,
and the oldest waiting date in Kampala time. Claims and private evidence retain
their existing scoped access and MFA requirements. Invalid queue URLs fail safely.

Reviewers can opt into application emails from the queue. Preferences start off,
are version checked and require recent MFA to change. Submission queues a durable,
deduplicated notification for opted-in reviewers with verified account emails.
Delivery rechecks the preference, current review grant and recipient verification.
The message links to the authenticated queue and contains no evidence, business
contact details or application identifiers. Existing mail configuration and worker
are reused; no production reviewer was opted in or emailed during this work.

## Shopper journey

Department thumbnails now search the department's whole eligible catalogue,
independently of home-page product limits. Only complete ready media are used;
a missing canonical thumbnail is not replaced by an incomplete home-page image.
Existing search, comparison, product details and contact-based purchase enquiries
remain. Londos still needs order, payment, inventory and fulfilment systems for
transactional parity with the larger marketplaces.

## Deployment and verification

Apply `038_operator_review_alerts.sql` through the existing migration path before
running this version. Startup migration handles it when configured; deployments
with a separate migration step apply it there. Readiness requires migration 038.
No new dependency, provider, secret or environment key is introduced.

Validation uses disposable local PostgreSQL, fictional accounts, local notification
sinks and the real image worker. No production catalogue or private competitor
merchant account was changed.

- Unit suite: **311 passed**.
- Complete integration suite: **373 passed** across 23 files. Includes guided
  photo policy, hidden/service exceptions, current versions, foreign resources,
  worker processing, photo counts beyond pagination, department thumbnails beyond
  home-page limits, incomplete variants, publication acknowledgement, reviewer
  preferences, filtered queues and notification suppression after opt-out or
  permission/verification removal. A focused rerun covers the final editor reader.
- Browser regression suites (`audit`, `catalogue-feedback`, `design-studio`,
  `p5`, `p8`, `persona-journeys` and `workspace-experience`): **30 distinct
  scenarios passed** across the suite run and focused lifecycle rerun. The
  lifecycle fixture now opens the current Review & publish tab and checks the
  department-aware discovery link, including disappearance after credit reversal.
  Existing publication fixtures explicitly acknowledge their text-only photo gaps.
- Final capture/access checks: **4 passed**, rerunning the new journeys and asserting anonymous,
  foreign-merchant and cross-origin denial for the new endpoints.
- Production build, lint, route/TypeScript checks, documentation links, changed-file
  Prettier and `git diff --check` pass. The configured-secret artifact scan passed
  for **1,985 files / 38 candidate values**; this checks exact configured values,
  not every possible secret.

The browser scenarios cover real photo upload/processing/automatic attachment,
failed upload recovery, inline departments, hidden saves, repeat entry, scoped
routes, one-form application submission, resumable application drafts and
MFA-protected queue/alert controls. Checks include 320/390/1280-pixel layouts,
horizontal overflow and automated WCAG A/AA checks. Browser phone viewports do
not replace installed Android, iOS or desktop-app testing or a human usability
study. No claim is made that every merchant will finish within two or three minutes.

New fictional captures:

- [Direct photo entry on a phone](images/photo-first-product-390-2026-10-30.png)
- [Product review at 320 pixels](images/product-review-320-2026-10-30.png)
- [Shop photo readiness](images/shop-photo-readiness-2026-10-30.png)
- [Landlord review on a phone](images/landlord-review-390-2026-10-30.png)

Older captures regenerated by regressions are preserved outside the repository;
their dated originals are restored before commit.
