# Londos billing and hosted operations

Updated 25 October 2026 (Africa/Kampala), hosted lifecycle branch. See the
[workflow audit and exact verification scope](evidence/HOSTED-WORKFLOWS-2026-10-25.md).
The [second workflow pass](evidence/HOSTED-WORKFLOWS-FOLLOWUP-2026-10-25.md) records
additional invitation, catalogue, search, team and concurrent payment-setting corrections.

## Separate payment flows

Londos does not process sales between customers and shopkeepers. Storefront contact and
merchant payment instructions belong to each shop. Londos subscription rent is paid to
platform collection accounts independently, then verified by an authorised finance operator.

## A paid shop and a published storefront are separate

1. A verified account creates a shop application, accepts the terms, supplies its business
   details/evidence and submits for review.
2. A scoped reviewer reviews it. An approved application receives an initial invoice under
   an explicit policy, either during approval or through the finance invoice form.
3. The shopkeeper follows the invoice's payment instructions and submits the actual external
   reference and payment method. A claim alone does not activate a shop.
4. A scoped finance operator with fresh native MFA independently checks settlement and
   records the exact verified credit. Full verified coverage provisions one private shop;
   partial payment does not provision it. A second initial invoice is rejected even after
   the first invoice has gained its shop ID. A receipt cannot be credited twice or reused
   across invoices. Independent reversal keeps the original ledger history.
5. In **Your shops**, open **Manage shop**. Its status explains whether it is private,
   rent-restricted, under management review, or live. Add products/contacts as appropriate,
   save a design, preview it, and deliberately publish. Setup guidance is not a new minimum
   product requirement. Payment never silently publishes an unfinished shop.
6. Once eligible and published, **Open public shop** and **Copy link** become available.
   Private or restricted shops receive a relevant next step rather than a dead public link.
   The public route, media, search and enquiry flow all retain publication/tenancy/moderation
   restrictions; a paid or published state cannot override a separate restriction.

## Clean shop addresses

Newly provisioned and bootstrap shops use a readable name such as `/shops/annette-fashion-house`,
without a UUID or automatic numeric suffix. If that address was ever reserved, the request
returns a conflict instead of adding `-2` or an ID. For a new initial invoice, the finance
operator can enter an optional **Shop public address** before the final credit; a promo-code
redemption has the same option. Choose meaningful words, such as the shop's location, while
retaining the actual business name. A rejected conflicting settlement/redemption is rolled
back and creates no credit or shop. Two shops cannot own the same address. Creation and owner
address changes share a transaction lock; database uniqueness and immutable address history
remain the final safeguards.

Migration **036** removes a legacy UUID tail only when it matches that shop's own ID and the
shorter address is safe and unreserved. Old URLs stay in address history and permanently
redirect to the latest canonical URL while the shop is public. No external link is discarded.
If a clean address is already another shop's current or former address, the migration leaves
that row unchanged; **Service configuration** displays a warning and the owner must choose
a distinct readable name. No automatic numeric fallback is created. Genuine digits within
a business name, such as `studio-54`, are retained.

Owners can open their shop overview,
choose **Edit address**, confirm fresh account security and choose an available address.
Former addresses remain reserved and redirect to the new address only while that shop is
publicly eligible. Renaming a profile does not silently rename its URL. Changing a URL does
not change the permanent shop identity, catalogue or financial history.

## Amounts, invoices and current collection accounts

UGX amounts are whole shillings. Entering **5,000** stores **5000**, not **500000**. Policy
and custom-invoice forms now follow the same convention as the ledger and display formatter.

**Review existing policies and invoices:** earlier versions of those two forms multiplied
UGX by 100. Existing records have not been divided, overwritten or reversed by this fix.
A legitimately large amount cannot be distinguished from a mistaken one automatically.
Check recorded amounts against the agreed terms before issuing or verifying payment.
Create a correct new policy where necessary; handle issued-invoice/credit corrections
through an authorised, audited finance process. Do not edit ledger rows directly.

Administrative payment settings support separate **MTN Mobile Money** and **Airtel Money**
numbers and registered names, plus the existing legacy mobile-money and bank instructions.
Only publish accounts actually controlled and verified by the operator. Each shopkeeper
invoice and newly queued tenancy reminder shows the configured networks separately. Optional
new fields preserve parsing of older queued messages. Old durable delivery records are not
rewritten; rejected or uncertain attempts are not blindly replayed.

Set `LONDOS_RENT_REMINDERS_ENABLED=true` only after the worker, migrations, verified accounts,
email delivery and applicable recipient policy are ready. The scheduler queues daily,
deduplicated notices for invoices due within seven days or overdue. A running worker and
provider acceptance do not prove inbox delivery. Set the flag to false to disable reminders.

Hosted reconciliation accepts independently verified payment credits (`operator-verified`).
Development-only waivers remain unavailable in hosted mode, including through direct API
submission; hiding an option in the UI is not the permission boundary.

## Design and workspace recovery

The dashboard separates shop tasks from account tools. Scoped staff see shops and navigation
for their effective merchant-and-shop permission intersection; design-only or finance-only
access does not grant catalogue, ownership or landlord access. Sensitive address changes
still require the owner and fresh authentication.

The designer now shows fixed, safe error categories and support references for validation,
missing access, stale proposals, limits and service failures. A failed status refresh does
not turn an already-confirmed proposal/apply, manual save or publication into a false mutation
failure. Publishing and unpublishing also refresh the status banner and public link without
a page reload. Unsaved manual
edits must be saved before publishing, restoring or reordering the saved revision. Review,
apply-as-draft and public publication remain separate actions. Remote AI configuration,
consent and budgets are unchanged; deterministic/manual paths remain available.

Analytics and resource-cost reporting still have their existing local-only policies. The
hosted pages explain unavailability after checking access rather than presenting them as
working live reports. No fabricated visitor totals, sales or bills are supplied.

## Admin communications and future payment integrations

Payment-instruction saves are serialized, including the first setup. If two operators save
the same version, only one succeeds; the other must reload and review the current accounts.
Authority and fresh native MFA are checked again after waiting for the save lock. A rejected
save does not create a payment-change announcement. This does not change existing account
values or automatically retry a rejected/uncertain email.

Custom campaigns accept subject, escaped body, optional on-site CTA and audiences
`all_shops`, `new_shops` and `specific_shops`, with the operations grant and fresh MFA.
Verify worker/provider outcomes before describing a campaign as delivered.

MTN/Airtel/card API integrations remain future work. Configuring collection instructions
is not enabling automatic payment settlement. Contracted providers require real credentials,
verified callbacks/signatures, matching invoice/account/amount/currency, final settled status,
deduplication and independently tracked reversals. Browser claims, screenshots, emails or
unverified callbacks must never create automatic credits.

The URL correction adds **036_clean_legacy_shop_addresses.sql**; migrations 001–035 are
unchanged. The current readiness contract requires 036. No new environment key is needed.
Use the
existing deployment/migration procedure. Keep PostgreSQL canonical, Redis optional, native
MFA and role/tenant boundaries enabled. Do not turn on local adapters on Render as a workaround.

## Merchant invitations and team access

Owners invite a verified account using its exact email. The invitee opens the private email
link, signs in with that email and explicitly accepts. Signing in does not accept an invitation.
New email links carry the token in a browser fragment rather than in HTTP requests. Existing
query links redirect to that form before page rendering. The entry page clears the token
from its visible URL and can restore it in the same tab for up to one hour during sign-in.
If browser storage is unavailable, sign in first and reopen the original email in that tab.
Clear a saved invitation when using a shared browser. The server still enforces the original
48-hour expiry, single use, invited email and current authentication; browser retention does
not extend an invitation or grant access by itself.

Team management pages now have separate member, invitation and shop page controls. Each
list stays bounded to 20 rows. Advancing shops does not move the member selection; owners
can assign staff to a shop beyond the first page without losing the staff list. Staff still
need both merchant permission and the corresponding shop grant. Legacy `page` links remain
supported. Invalid page values fail safely rather than producing an application error.

A confirmed team or catalogue save remains confirmed if the following reload fails. Reload
before another change; the stale form is disabled until current state is available. A team
change that removes your own owner access may prevent a subsequent team read. Return to
Your shops or check Account security rather than repeatedly submitting the completed change.

## Catalogue and discovery

Creating a department or product clears its creation form after a confirmed save; rejected
writes retain input. The storefront's Browse collection button targets a real collection
or department navigation. Exact product search matches open that product directly, including
items beyond the first department page. Department and shop matches retain their existing
destinations and ranking. Archiving, unpublishing and tenant restrictions still apply.

Use **Preview saved draft** to browse departments and products before publishing. Links stay
inside the private preview and retain its selected layout revision. **Preview proposal**
retains that proposal's identity while browsing; return to its review screen to apply it.
Neither preview publishes the shop or changes its catalogue, prices or financial records.
