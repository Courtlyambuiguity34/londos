# Communications and manual billing

Londos keeps PostgreSQL authoritative for accounts, email jobs, campaigns, promotions, invoices and
payment claims. Brevo is a delivery adapter, not an identity or billing database. The background
worker must be running for queued mail to leave the database.

## Available workflows

- `/register` creates a shopkeeper identity with no merchant membership or operator permission. It
  queues a single-use verification email and the user cannot sign in until verification succeeds.
  Duplicate submissions return the same public result to avoid account enumeration. Landlord/admin
  accounts are never created by public registration.
- `/recover` supports the existing shopkeeper and Landlord identities with expiring, single-use
  native reset links. Londos never sends or displays the existing password.
- The first successful shop provision queues a welcome email linking to the private shop workspace.
- Rent status mail includes the current invoice reference, remaining exact minor units, configured
  payment methods and a link to the authenticated invoice. A merchant may submit an external
  transaction reference, but this never activates rent. A finance operator must compare the
  external record and reconcile the exact reference; rejection and verification are audited.
- **Landlord → Communications & billing** lets an operations operator send an escaped plain-text/
  HTML announcement to all shops, shops created in a bounded recent window, or selected shops. A
  finance operator can configure payment/support details and create bounded free-period,
  percentage or fixed-amount promotions. Targeted promotions are announced only to the selected
  merchants' shops.
- `LONDOS_MONTHLY_REPORTS_ENABLED=true` enables monthly owner summaries. Reports contain aggregate
  recorded actions—not unique people, sales or guaranteed reach—and are idempotent per month, shop
  and owner. Leave the switch false until analytics/privacy terms and live email are approved.

All email types use one Londos-branded responsive HTML shell plus a plain-text alternative. Operator
campaign content is escaped; it cannot inject HTML or an external action URL. Verification and reset
links must use the configured Londos origin.

## Configure Brevo

Set these secrets and server-only settings in the web and worker environments:

```dotenv
LONDOS_LOCAL_ADAPTERS=false
LONDOS_EMAIL_PROVIDER=brevo
LONDOS_BREVO_API_KEY=replace-in-secret-manager
LONDOS_EMAIL_FROM=verified-sender@example.com
LONDOS_EMAIL_FROM_NAME=Londos
LONDOS_EMAIL_MAX_PER_HOUR=250
LONDOS_EMAIL_MAX_PER_DAY=250
LONDOS_MONTHLY_REPORTS_ENABLED=false
```

Never use a mock key outside local logic tests. Verify the sender/domain in Brevo and run
`npm run email:verify`; this command makes account/sender checks but sends no email. Then run the
compiled worker against the same `DATABASE_URL` as the web service.

Brevo's official [Free plan FAQ](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
was checked on **2026-10-10** and states 300 sends per day. Londos therefore defaults to a
conservative 250 per hour **and** 250 per day. PostgreSQL reserves quota atomically and defers excess
jobs to the next window without spending their retry allowance. Set both values at or below the
current provider plan and leave headroom for other sends.

A 20,000-recipient campaign cannot complete in 24 hours on a 300-per-day plan; at 250 application
sends per day it requires about 80 days. Upgrade the approved provider plan or narrow the audience
rather than bypassing the cap. Londos will keep draining the durable queue while the worker remains
healthy.

## Operator procedure

1. Sign in with native MFA and the exact required grant: `operations` for campaigns, `finance` for
   payment settings/promotions/reconciliation.
2. Configure support and either a complete Mobile Money pair or complete bank details. Saving with
   **notify shops** creates a normal quota-controlled campaign; it does not expose settings publicly.
3. For a campaign, preview the subject/body, choose the smallest audience, confirm, then monitor the
   durable job and delivery status. A submitted campaign's content and audience are immutable.
4. For a promotion, choose its benefit, eligibility, start/end timestamps and optional total
   redemption cap. Each merchant can redeem a promotion once and each invoice can receive at most
   one promotion redemption. The immutable ledger records the waiver.
5. For a payment claim, verify the actual external statement and exact invoice/reference before
   reconciliation. A typed reference from a merchant is evidence to review, never proof of payment.

## Failure and privacy rules

- Provider acceptance is stored without recipient address, action token, API key or response body.
- Accepted deliveries are not resent after an acknowledgement loss. Uncertain/rejected attempts
  require reconciliation; request a fresh reset/verification action when appropriate.
- Fictional `.invalid`, `.example`, `.test` and reserved example recipients never reach Brevo.
- Campaign recipients derive only from verified active shop-owner memberships. Shopkeeper invoice
  reads remain merchant-scoped; Landlord routes retain explicit grants and recent native MFA.
- The local adapter writes only to the ignored private sink. Tests use fictional addresses and mock
  transports and do not prove real inbox delivery.

Apply migrations before enabling these controls and keep web plus worker on the same schema. See
[deployment profiles](DEPLOYMENT-PROFILES.md), [Render setup](RENDER-SETUP.md), and the
[self-hosted guide](../deploy/selfhosted/README.md). The executed verification is recorded in
[communications evidence](evidence/COMMUNICATIONS-2026-10-10.md).
