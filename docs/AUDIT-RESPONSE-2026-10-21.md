# Deep audit response — 21 October 2026

Reviewed the user-supplied `Londos_Deep_Audit_Report.docx` against the current
implementation, starting at commit `c9e0361`. The report was treated as review
material, not as authority to change financial policy, remove security gates or
declare unfinished hosted workflows production-ready. The earlier Render
environment-variable automation task was cancelled; no environment settings were
changed as part of this work.

## Implemented

| Finding | Change and limits |
| --- | --- |
| Mobile navigation hides important links | Added a native disclosure menu below 850px with Explore, Our mall, Open your shop, sign-in/authorized Shopkeeper and all categories. Native opening works without JavaScript; hydrated navigation supports Escape and returns focus to the trigger. The same server-side membership decision controls the merchant link. |
| Small mobile targets/type | Menu links and key category/filter/form controls have at least 44px target heights; selected public metadata and product text are larger. This is a targeted pass, not a global typography/theme rewrite. |
| Contact choices have competing primary buttons | Available, enabled contacts now use WhatsApp → call → enquiry → merchant website priority, with one filled primary button per contact group. Disabled/unconfigured methods remain absent; private previews do not offer guest enquiry submission. |
| Designed hero ignores disabled contacts | Hero WhatsApp/enquiry buttons now use the same enabled-action checks as the contact group. This fixes a real inconsistency in the current renderer. |
| Development copy in a hosted shop | The site header/footer already respected hosted mode, but the shop's own footer did not. That remaining fictional/development label now appears only for local adapters. A local application-review badge is not presented as live merchant verification. |
| Broken hosted reporting link | The report form and API are development-only. Hosted shops now state that online concern reporting is unavailable instead of linking to a 404. The guard remains in place; this does not complete live reporting. |
| Payment claim ambiguity | Shared invoice UI explains that a claim is evidence, not confirmed payment, and names pending/verified/rejected states plainly. Credited balances remain independent of claim states, including partial credits and waivers. Money calculations retain BigInt/minor units. |
| Rent/grace readability | Tenant state labels are clearer and due/grace shops display the deadline calculated from their actual contract policy, in East Africa Time. Missing policies do not get an invented grace deadline. No state-machine or collection rule changed. |
| Report acknowledgement lacks a take-away receipt | Acknowledged submissions display their existing submission reference and offer a text receipt download. Neither the private upload capability nor the report body is downloaded. The receipt is not a public tracking link, review decision, response-time promise or proof that a target exists. |
| Setup guidance is too terse | Added linked, advisory steps for departments, three products/services, contacts, design preview and publication, plus a progress indicator. Profile editing and all existing actions remain. Three products is a suggestion, never a new publication gate. Product progress ignores archived departments/items; an empty contact record is no longer counted as configured. Detailed states remain available in an expandable section. |
| Invalid campaign CTA can be queued | Shared client/server validation rejects protocol-relative external hosts and traversal segments before queuing. The email renderer already rejected external origins; this fixes the earlier queue/composer failure path. A half-filled button is explained instead of silently discarded. Operators must still check that a local destination exists and is appropriate for recipients. |

## Existing behaviour retained

- Public indexing/canonical URLs remain opt-in; private pages stay noindex.
- Guest browsing requires neither account nor app installation.
- Server authorization, tenant isolation, fresh MFA, audit records, idempotency,
  scope checks and confirm-gated financial actions remain authoritative.
- Manual rent and existing lifecycle restrictions remain. A payment claim does
  not activate coverage. No automatic checkout or live payment collection added.
- Missing product media already uses a deliberate placeholder; the catalogue
  already offers upload/selection controls. No image provider was enabled.
- The design assistant already explains preparing, proposed, rejected, expired
  and failure states, with preview/manual alternatives. These paths were not
  rewritten or represented as new work.
- No public GDPR/NDPR compliance claims were found in the searched app/components.
  Existing privacy limitations and release evidence remain in force.
- Development disclosures remain on genuine fixture/local workflows. Removing
  them there would misrepresent the product, contrary to the audit's honesty goal.

## Deliberately separate work

| Recommendation | Reason not to implement in this batch |
| --- | --- |
| Landlord “Today” queue | Aggregation must reuse each queue's record scopes, grants and fresh-MFA requirements. Broad global counts would risk exposing restricted operational data. Existing authorized queue entry points remain. Design and test the aggregation as its own feature. |
| Split all of `globals.css` | A large stylesheet move could change cascade order across many existing shop designs. This change adds a small, scoped section and verifies affected layouts. Split styles incrementally with wider visual coverage. |
| Live trust/reporting and subject-rights completeness | Requires closing the documented hosted workflow/policy gates, not merely changing copy or removing `localLifecycle` checks. Hosted reporting remains a known pilot blocker. |
| “Verified”/active-tenant marketing badges | Do not equate development review or paid tenancy with verified identity, safe products or guaranteed payments. No new assurance badge was invented. |
| Universal WhatsApp-first experience | WhatsApp is preferred only when the merchant has enabled it and supplied a number. Call/enquiry/website remain available according to their existing configuration. |
| New ranking/analytics/designer marketplace features | These alter discovery, privacy or commercial behaviour. Existing in-shop continuity and opt-in analytics remain; no silent new tracking or ranking change. |
| Real Android device sign-off | Browser emulation/accessibility checks were executed. Physical-device, assistive-technology and real-provider acceptance require actual pilot hardware and accounts; no such pass is claimed. |

## Verification and handoff

See [executed checks and file inventory](evidence/AUDIT-2026-10-21.md). No database
migration, dependency addition, environment variable, provider call, real email,
DNS change or hosting configuration is needed for these application changes.
Deploy the new application build through the existing release process. Existing
credentials and production workflow gates are unchanged.
