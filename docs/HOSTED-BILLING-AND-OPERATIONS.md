# Londos billing and hosted operations

Updated 25 October 2026 (Africa/Kampala), hosted lifecycle branch. See the
[workflow audit and exact verification scope](evidence/HOSTED-WORKFLOWS-2026-10-25.md).

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
without a UUID suffix. If that address was ever reserved, the allocator chooses the next
readable suffix, such as `-2`. Two shops cannot own the same address. Creation and owner
address changes share a transaction lock; database uniqueness and immutable address history
remain the final safeguards.

Existing shop URLs are **not** rewritten automatically. Owners can open their shop overview,
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

Custom campaigns accept subject, escaped body, optional on-site CTA and audiences
`all_shops`, `new_shops` and `specific_shops`, with the operations grant and fresh MFA.
Verify worker/provider outcomes before describing a campaign as delivered.

MTN/Airtel/card API integrations remain future work. Configuring collection instructions
is not enabling automatic payment settlement. Contracted providers require real credentials,
verified callbacks/signatures, matching invoice/account/amount/currency, final settled status,
deduplication and independently tracked reversals. Browser claims, screenshots, emails or
unverified callbacks must never create automatic credits.

No new environment variable or schema migration is introduced by this audit correction.
The branch's existing migration contract is **035_production_rent_reversals.sql**. Use the
existing deployment/migration procedure. Keep PostgreSQL canonical, Redis optional, native
MFA and role/tenant boundaries enabled. Do not turn on local adapters on Render as a workaround.
