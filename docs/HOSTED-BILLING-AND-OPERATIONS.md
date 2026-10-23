# Londos billing and hosted operations

## Separate payment flows

Londos does not process sales between customers and shopkeepers. Storefront contact and merchant payment instructions belong to each shop. Londos subscription rent is paid to the platform independently.

## Direct rent collection (current)

Configure the operator's mobile money account and support address in the existing administrative payment settings. The current settings contain **one** mobile-money number and account name, not separate MTN and Airtel accounts. Do not describe that number as both networks unless the operator has verified it can accept both. Use the support address to clarify network-specific instructions.

Set `LONDOS_RENT_REMINDERS_ENABLED=true` only after the email worker, database migrations, payment settings and recipient consent/compliance have been verified. The existing communications scheduler then queues daily, deduplicated notices for invoices due within seven days or overdue. The worker must be running for email delivery; queueing is not proof of delivery. Set the flag to `false` to disable reminders.

Recipients are instructed to include their registered business/shop name as the payment reason and retain the transaction reference. **A payment claim or a matching name does not verify settlement.** Never activate or renew a shop solely on a claim, screenshot, email or unverified callback.

## Admin communication

The existing `createCampaign` service accepts custom subject and body, optional on-site CTA, and audiences `all_shops`, `new_shops`, and `specific_shops`. It requires an operator with the operations grant and fresh MFA. Confirm email transport and worker processing before announcing a campaign as sent.

## Future payment integrations (not live)

Integrations for MTN MoMo, Airtel Money, Visa and Mastercard require a contracted payment provider, credentials, supported country/currency, production callbacks and settlement reports. Keep credentials server-side. On webhook receipt, validate provider signature, merchant/account, invoice reference, amount, currency, event uniqueness and final settled status; persist the raw provider event safely and reconcile idempotently. Reversals/refunds must be independently tracked. Do not credit invoices from browser submissions or unverified webhook requests.

## Production release blockers

Hosted application creation, evidence access, landlord approvals, production rent policies, verified reconciliation and automatic provisioning are still guarded. The development-only `local-manual` ledger is **not** a production settlement adapter. Do not set `LONDOS_LOCAL_ADAPTERS=true` on Render to bypass those restrictions.

Before enabling financial mutations, add an audited provider-backed or independently verified finance workflow, explicit non-development policy, anti-self-approval controls, transactionally safe provisioning, capacity enforcement, and integration tests for duplicate/replayed receipts, partial payments, revoked roles and rollback.
