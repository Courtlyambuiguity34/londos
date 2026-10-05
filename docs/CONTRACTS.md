# Domain contracts for the next implementation stage

Status: initial state records and identity/permission/transaction contracts are backed by X1 code and corrected/verified in [R1](evidence/R1-REVIEW.md). X2 adds reviewed local catalogue/contact/request/private-media commands; see [ADR-0004](ADR/0004-catalogue-contact-and-private-media.md). X2 also implements the local LSS/publication, canonical PostgreSQL discovery and eligible ready-image paths; see [ADR-0005](ADR/0005-safe-design-and-canonical-public-reads.md). Full lifecycle and live financial/provider commands remain later phases. See [ADR-0003](ADR/0003-identity-and-durable-jobs.md) and [X1-SECURITY](X1-SECURITY.md).

## State separation

| Record | States | Required rule |
|---|---|---|
| Application | draft, submitted, reviewing, needs_information, approved, rejected | Only authorized review advances approval; resubmission retains history. |
| Shop publication | provisioning, unpublished, active, temporarily_closed, archived | Immutable shop identity is independent of slug and internal mall placement. |
| Tenancy | pending, active, due, grace, closed | Verified obligations/events drive state; policy timers remain draft until approved. |
| Moderation | clear, under_review, suspended | Renewal cannot lift suspension. Only an authorized moderation decision can. |
| Media | uploaded, validating, processing, ready, rejected, failed, deleted | Quarantined/raw assets are not public ready media. |

Public eligibility must combine current publication, tenancy, moderation and resource visibility. The fixture preview's open/closed/suspended flags are demonstration data, not the implemented policy engine. The local shared eligibility rule permits active/due/grace tenancy only with active publication and clear moderation; rendered shops/search require a published design. Live grace/notice/rent/retention policies still require owner approval.

## Permission matrix and implementation boundary

This matrix includes planned capabilities. X1/R1 implement profile/membership/invitation/ownership and job metadata/replay. X2 adds catalogue, contact/request and private media commands, scoped operator support reads and audited contact recovery. Design/preview/publish commands now use separate grants, immutable scoped revisions and fresh publication authentication. Finance, provisioning, live report/verification and private-evidence workflows remain later phases. Each new action needs its own grant, scope and attack tests.

| Action | Merchant owner | Staff | Operator |
|---|---|---|---|
| Read/edit catalogue and ordinary profile | Own shops | Explicit own-shop grant | Explicit scoped support permission |
| Draft/preview/publish design | Own shops; publication also needs fresh authentication | Separate membership/shop design and publish grants | No design command access is implemented; future support requires its own scoped contract |
| Change contact/payment details | Own shops plus step-up | Separate sensitive grant plus step-up | Authorized investigated recovery plus step-up |
| View rent and payment records | Own shops | Separate finance grant | Finance/reconciliation permission |
| Change membership/ownership | Owner plus step-up and last-owner rules | No implicit permission | Explicit recovery authority and audit |
| Approve/provision/suspend/reinstate | No | No | Specific operator permission, MFA, reason and audit |
| Read private evidence/reports | Only policy-approved own records | No implicit permission | Least-privilege verification/trust permission |

Every server read/action validates actor, permission and actual resource ownership. The browser does not supply trusted roles. Operator access is separated from ordinary merchant membership. With core services disabled, demo portal pages show no private data/actions. With explicit local core configuration, protected profiles/security/operator job views enforce these policies. Staff additionally require a per-shop grant; operator support/review resources require an explicit shop scope.

Operator job metadata/replay uses a separate explicit global job permission and fresh MFA for replay; it does not expose job payloads. That permission does not grant merchant support access.

## Revocation and invitation contracts

MFA proof requires the current session, factor identity and credential generation. Password changes/reset revoke preceding sessions and pending challenges atomically; factor removal does likewise. Requests verifying old credentials across a reset cannot establish fresh authority. Migration 007 clears old proofs, preserving users and sessions but requiring another MFA challenge where enrolled.

An active owner may issue a bounded, email-bound, expiring one-use invitation. Removal, demotion or ownership transfer that ends that issuer's active-owner authority revokes their unaccepted invitations in the same transaction; restoring the role cannot revive them. Accepted memberships remain independent. Acceptance rechecks the recipient's session and step-up after acquiring the merchant lock, comparing expiry with current wall-clock time.

Mutations recheck authority after serialization waits. Revocation before that final check denies the action; already-authorized commands are not promised retroactive cancellation. Preserve this boundary explicitly when implementing each new command.

## Persistence and side effects

Canonical mutations require a database transaction, tenant-consistent references, conflict checks where relevant, and durable audit/event registration. Outbox/transactional queue processing must survive crashes and tolerate duplicate/out-of-order delivery. Prices use exact integer minor units; the SQL domain rejects fractional/nonfinite/out-of-range inputs rather than rounding them. Rent corrections create new events rather than overwrite history.

## Interface progress

- Implemented: current actor/session/action/shop permission resolver with explicit denial.
- Implemented: scoped private profile/membership/invitation services and tenant-consistent database constraints. Extend to every new resource.
- Implemented: shared canonical public eligibility; dynamic no-store shop/search/media responses; generated indexed search vectors update transactionally. No public asynchronous projection/shared CDN cache is used.
- Implemented: transactional queue, version-aware internal profile projection, idempotency/lease/effect receipts, scheduler and local notification/storage interfaces. New consequential handlers require their own tests.
- Implemented: closed LSS schema 1 and prototype registry, owned references, immutable drafts, manual patches, private previews, version-checked publication and restoration as a new draft.
- Provider adapters for storage, notification, payment and AI; fakes labeled separately from verified live capability.

R1 and the local X2/P5–P7 prototype are verified; see [X2 prototype evidence](evidence/X2-P6-P7.md). Continue **Sol 6.1 Extra High with P8**, extending lifecycle/provider/policy contracts before their dependent operations. Final system/release review remains **6 Astra Extra High R2**.
