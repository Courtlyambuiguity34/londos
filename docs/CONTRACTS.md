# Domain contracts for the next implementation stage

Status: initial state records and identity/permission/transaction contracts are backed by X1 code and corrected/verified in [R1](evidence/R1-REVIEW.md). Lifecycle transitions, public eligibility, publication/media and live financial commands remain later phases. See [ADR-0003](ADR/0003-identity-and-durable-jobs.md) and [X1-SECURITY](X1-SECURITY.md).

## State separation

| Record | States | Required rule |
|---|---|---|
| Application | draft, submitted, reviewing, needs_information, approved, rejected | Only authorized review advances approval; resubmission retains history. |
| Shop publication | provisioning, unpublished, active, temporarily_closed, archived | Immutable shop identity is independent of slug and internal mall placement. |
| Tenancy | pending, active, due, grace, closed | Verified obligations/events drive state; policy timers remain draft until approved. |
| Moderation | clear, under_review, suspended | Renewal cannot lift suspension. Only an authorized moderation decision can. |
| Media | uploaded, validating, processing, ready, rejected, failed | Quarantined/raw assets are not public ready media. |

Public eligibility must combine current publication, tenancy, moderation and resource visibility. The fixture preview's open/closed/suspended flags are demonstration data, not the implemented policy engine. Grace visibility, notice periods, rent amount and retention remain owner policies to confirm before live operation.

## Permission matrix and implementation boundary

This matrix includes planned capabilities. X1/R1 implement ordinary profile reads/edits, membership/invitation/ownership services and operator job metadata/replay; catalogue, design, finance, provisioning and private-evidence commands remain later phases. Each new action needs its own grant, scope and attack tests.

| Action | Merchant owner | Staff | Operator |
|---|---|---|---|
| Read/edit catalogue and ordinary profile | Own shops | Explicit own-shop grant | Explicit scoped support permission |
| Draft/preview/publish design | Own shops | Separate design/publish grants | Audited authorized support only |
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
- Public eligibility resolver and cache/projection revocation contract.
- Implemented: transactional queue, version-aware internal profile projection, idempotency/lease/effect receipts, scheduler and local notification/storage interfaces. New consequential handlers require their own tests.
- LSS structural/semantic/reference/policy validator and compare-and-swap publication.
- Provider adapters for storage, notification, payment and AI; fakes labeled separately from verified live capability.

R1 review of the implemented boundary is complete. Continue under owner-confirmed **Sol 6.1 Extra High X2**, extending contracts/tests as described in [the handoff](X2-HANDOFF.md). Final system/release review remains **6 Astra Extra High R2**.
