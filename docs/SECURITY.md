# Security, Trust & Safety

Security is a building requirement, not a hidden-admin-URL trick.

## Authentication

### Customer
No account required for ordinary public browsing/discovery.

### Shopkeeper
Authenticated. MFA/2FA should be available and strongly encouraged/required according to risk. Sensitive actions may require step-up authentication.

### Landlord
Authenticated with **mandatory MFA** and stricter session/access controls.

## Authorization

Use server-side role/tenant authorization on every protected action. Never trust:
- hidden URLs;
- disabled UI buttons;
- client-supplied shop IDs;
- obscurity;
- frontend-only role checks.

## Tenant isolation

A merchant must never be able to read/write another merchant's private data by changing an identifier. Test this as a first-class security property.

## Data protection

Baseline controls:
- TLS in transit;
- strong password hashing;
- encryption for appropriate sensitive data at rest/field level;
- secrets outside source code;
- least-privilege database/service credentials;
- encrypted backups;
- audit logs for sensitive operator/merchant actions;
- rate limiting/abuse controls;
- secure upload validation;
- dependency/security patch process.

## Shop design sandbox

Conversational design and professional designer tooling must output/use an approved safe shop model.

Do not allow tenants to:
- run arbitrary server processes;
- access platform secrets;
- query the database directly;
- read another shop's data;
- bypass authentication;
- inject unrestricted executable scripts into customer sessions.

## Trust and tenancy

Landlord capabilities should include:
- application review;
- merchant verification;
- report intake;
- impersonation/fraud investigation;
- prohibited-goods enforcement;
- suspension/closure;
- appeal/review workflow where policy provides;
- immutable/auditable administrative actions.

## Payments

If Londos does not hold merchant funds initially, that reduces some payment-custody exposure but does **not** eliminate fraud, consumer-protection or privacy responsibilities. Payment instructions displayed by merchants require anti-impersonation and policy controls.

## Backups

Backups must be:
- automated;
- encrypted;
- versioned/retained according to policy;
- periodically restored in tests.

A backup that has never been restored is an assumption, not a recovery system.

## Before production

Perform:
- threat modeling;
- tenant-isolation tests;
- authorization tests;
- upload security tests;
- dependency scanning;
- backup/restore drill;
- incident-response plan;
- privacy/data-retention review;
- legal/regulatory review appropriate to operating markets.

## Implemented P10 design boundary

[P10 evidence](evidence/X2-P10.md) and [ADR-0013](ADR/0013-provider-neutral-conversational-design.md) record private assistant isolation. Fresh native design authority precedes minimal context assembly and is rechecked after network/lock waits and before storage/preview/application. Original requester, immutable retry identity, current proposal/base/context/catalogue versions and confirmation guard atomic draft application. Publication is a separate existing authorized command. Provider credentials remain server-side secure bindings; fixed HTTPS endpoints, normal proxy/CA/TLS, no redirects/tools and bounded readers/deadlines constrain transport. Closed untrusted intent passes full deterministic LSS/owned-reference budgets. No provider calls enter public rendering. Malicious/provider failures, stale authority, expiry and actual SQL rollback cannot publish.

No raw instruction/prompt/invalid output/provider error body is retained. Validated candidates are scrubbed at terminal action/expiry; minimal immutable receipts/redacted attempt metadata remain, with production retention/backups still release obligations. Durable request/token/configured-estimate/concurrency limits and shared cooldowns stop retry/credential quota cycling. Safe sentinels, all four protected HTTP methods, both HTML/Flight pages, real serialization waits and configured-value artifact/staged scans pass locally. Both live AI accounts remain unavailable; fake contracts do not establish real provider access/model quality or a production security certification.
