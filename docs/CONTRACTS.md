# Domain contracts for the next implementation stage

Status: initial state records and identity/permission/transaction contracts are backed by X1 PostgreSQL/authentication/worker code and local tests. Lifecycle transitions, public eligibility, publication/media and live financial commands remain later phases. Review the implemented boundary under R1; see [ADR-0003](ADR/0003-identity-and-durable-jobs.md) and [X1-SECURITY](X1-SECURITY.md).

## State separation

| Record | States | Required rule |
|---|---|---|
| Application | draft, submitted, reviewing, needs_information, approved, rejected | Only authorized review advances approval; resubmission retains history. |
| Shop publication | provisioning, unpublished, active, temporarily_closed, archived | Immutable shop identity is independent of slug and internal mall placement. |
| Tenancy | pending, active, due, grace, closed | Verified obligations/events drive state; policy timers remain draft until approved. |
| Moderation | clear, under_review, suspended | Renewal cannot lift suspension. Only an authorized moderation decision can. |
| Media | uploaded, validating, processing, ready, rejected, failed | Quarantined/raw assets are not public ready media. |

Public eligibility must combine current publication, tenancy, moderation and resource visibility. The fixture preview's open/closed/suspended flags are demonstration data, not the implemented policy engine. Grace visibility, notice periods, rent amount and retention remain owner policies to confirm before live operation.

## Initial permission matrix to validate under X1

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

## Persistence and side effects

Canonical mutations require a database transaction, tenant-consistent references, conflict checks where relevant, and durable audit/event registration. Outbox/transactional queue processing must survive crashes and tolerate duplicate/out-of-order delivery. Prices use exact money representation. Rent corrections create new events rather than overwrite history.

## Interface progress

- Implemented: current actor/session/action/shop permission resolver with explicit denial.
- Implemented: scoped private profile/membership/invitation services and tenant-consistent database constraints. Extend to every new resource.
- Public eligibility resolver and cache/projection revocation contract.
- Implemented: transactional queue, version-aware internal profile projection, idempotency/lease/effect receipts, scheduler and local notification/storage interfaces. New consequential handlers require their own tests.
- LSS structural/semantic/reference/policy validator and compare-and-swap publication.
- Provider adapters for storage, notification, payment and AI; fakes labeled separately from verified live capability.

Review these decisions with 6 Astra Extra High after the X1 implementation and before widening protected functionality.
