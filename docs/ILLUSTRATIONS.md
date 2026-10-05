# Londos system and journey illustrations

These diagrams describe the intended application and the implemented preview separately. The SVG artwork under `public/illustrations` is platform-owned fictional demonstration art; it is not merchant-uploaded content or photography.

## Intended application boundaries

```mermaid
flowchart TB
  Customer[Anonymous customer] --> Public[Mall and Shop server-rendered routes]
  Merchant[Merchant session] --> Shopkeeper[Shopkeeper]
  Operator[Operator session with MFA] --> Landlord[Landlord]
  Public --> Read[Public eligibility and scoped reads]
  Shopkeeper --> Policy[Identity, permission and tenant policies]
  Landlord --> Policy
  Policy --> Domain[Domain services and transactions]
  Read --> DB[(Canonical PostgreSQL)]
  Domain --> DB
  Domain --> Outbox[Durable event or transactional queue]
  Outbox --> Worker[Independent Node worker]
  Worker --> Search[Public search projection]
  Worker --> Storage[Validated media and responsive variants]
  Worker --> Notify[Notifications and reminders]
  Shopkeeper --> Designer[Authorized design context]
  Designer --> AI[Optional provider-neutral AI]
  AI --> Validate[Deterministic LSS validator]
  Validate --> Preview[Private preview]
  Preview --> Confirm[Merchant confirms publication]
  Confirm --> Domain
```

X1 implements local PostgreSQL, the initial session/MFA/permission boundary and the durable worker. X2 adds catalogue/contact commands, guest requests and private worker media processing. P6/P7 adds safe LSS/publication, canonical PostgreSQL search and eligible public image delivery. P8 adds local applications/review, development rent/provisioning, scheduled tenancy, owner teams/addresses and scoped shop operations. Live providers, trust moderation, the wider renderer registry and AI remain later stages. The complete diagram is the intended system, not a claim that every component is ready.

## Implemented X1 identity and mutation boundary

```mermaid
flowchart TD
  Login[Password and verified email] --> Challenge{MFA enrolled?}
  Challenge -->|Yes| Factor[TOTP or unused recovery code]
  Factor --> Proof[Proof bound to session, factor and credential generation]
  Challenge -->|No| Session[Password session]
  Proof --> Policy[Current session and explicit action permission]
  Session --> Policy
  Policy --> Tenant[Merchant ownership and staff shop grant]
  Tenant --> Lock[Merchant lock and current version]
  Lock --> Commit[(One PostgreSQL transaction)]
  Commit --> Profile[Canonical profile]
  Commit --> Audit[Append-only audit]
  Commit --> Job[Durable job]
  Proof --> Operator[Separate operator permission and scope]
  Operator --> Sensitive[Fresh MFA for replay or sensitive action]
```

Private page policy also runs before HTML/Flight streaming. Domain/handler authorization remains required. Customers continue browsing without authentication.

## R1 credential and invitation revocation

```mermaid
flowchart TD
  Reset[Password changes or factor removed] --> Epoch[Rotate credential generation]
  Epoch --> Revoke[Revoke sessions, proofs and pending challenges]
  Attempt[In-flight password or MFA verification] --> Compare{Observed generation still current?}
  Epoch --> Compare
  Compare -->|No| Deny[Reject completion and suppress new cookies]
  Compare -->|Yes| Verify[Complete native verification and current-session policy]
  Owner[Issuer loses active-owner authority] --> Invites[Revoke unaccepted invitations in same transaction]
  Accept[Recipient accepts invitation] --> Lock[Acquire merchant lock]
  Lock --> Check[Recheck session, step-up and wall-clock expiry]
  Invites --> Check
  Check --> Decision{All current checks pass?}
  Decision -->|Yes| Commit[Commit membership, audit and job]
  Decision -->|No| Refuse[Deny without membership change]
```

Migration 007 invalidates old MFA proofs while preserving users and sessions. [R1 evidence](evidence/R1-REVIEW.md) records actual factor/reset races, lock-wait expiry/logout tests and database preservation. Ordinary operations already authorized at their final check are not promised retroactive cancellation.

## Implemented X1 job recovery

```mermaid
stateDiagram-v2
  [*] --> pending: domain transaction commits
  pending --> running: claim and unique lease token
  running --> done: idempotent effect then acknowledgment
  running --> pending: lease expires or retryable failure
  running --> dead: attempt budget exhausted
  dead --> pending: scoped operator with fresh MFA replays
  done --> [*]
```

The separate worker reads canonical versions, fences old leases and uses a durable effect receipt. Local notifications use an atomic private file keyed by job ID. Forced process-death tests cover commit, effect and delivery boundaries; real provider delivery still requires its own idempotency evidence.

## Initial canonical relationships

```mermaid
erDiagram
  USER ||--o{ SESSION : authenticates
  SESSION ||--o| MFA_PROOF : verifies
  USER ||--o{ MEMBERSHIP : joins
  MERCHANT ||--o{ MEMBERSHIP : authorizes
  MERCHANT ||--o{ SHOP : owns
  MALL ||--o{ SHOP : groups
  SHOP ||--o{ STAFF_SHOP_GRANT : scopes
  SHOP ||--o{ DEPARTMENT : contains
  DEPARTMENT ||--o{ PRODUCT : groups
  SHOP ||--|| PUBLICATION : separates
  SHOP ||--|| TENANCY : separates
  SHOP ||--|| MODERATION : separates
  MERCHANT ||--o{ APPLICATION : applies
  APPLICATION ||--o{ INVOICE : precedes_shop
  INVOICE ||--o{ RENT_EVENT : records
  MERCHANT ||--o{ AUDIT_EVENT : audits
  MERCHANT ||--o{ JOB : queues
```

Composite database keys additionally enforce tenant/shop agreement; the diagram omits those columns for readability. Future feature schemas and command transitions evolve through new reviewed migrations.

## Implemented anonymous preview journey

```mermaid
flowchart LR
  Entrance[Mall entrance] --> Search[Search shoes]
  Search --> Result[Annette Fashion House result]
  Result --> Shoes[Annette shoes department]
  Shoes --> Product[Illustrated canvas sneakers]
  Product --> Shop[Browse the whole shop]
  Shop --> Dresses[Dresses and other departments]
  Product --> Notice[Clear fictional-product notice]
```

No account or AI call is needed for this path. Purchases and enquiries remain unavailable in the read-only preview.

## Model handoff sequence

```mermaid
flowchart LR
  H[Sol 6.1 High foundation] --> Reminder[Save evidence and remind owner]
  Reminder --> Confirm[Owner confirms Extra High setting]
  Confirm --> X1[Sol 6.1 Extra High security and persistence]
  X1 --> Astra[Owner switches to 6 Astra Extra High review]
  Astra --> R1[Save R1 findings, fixes and evidence]
  R1 --> Switch[Owner confirms Sol 6.1 Extra High]
  Switch --> X2[X2 catalogue, contact and media]
  X2 --> P6[P6 safe manual design and publication]
  P6 --> P7[P7 eligible public discovery and benchmark]
  P7 --> P8[P8 local applications and development rent]
  P8 --> Admin[P8 local teams, addresses and scoped operations]
  Admin --> Next[P9 trust and analytics, then later gates before Astra R2 review]
```

The assistant records the next setting in BUILD-STATUS. The owner operates the model selector; the assistant does not switch it automatically.

## Local artwork inventory

- `mall.svg`: independent shops around a shared courtyard.
- `shop-*.svg`: six category-specific sample storefronts.
- `product-*.svg`: ten product/service illustrations, marked as samples.

The application renders these fixed trusted SVGs with explicit dimensions and lazy loading except for initial hero/product art. Tenant SVG uploads are rejected by the implemented X2 media policy; only bounded single-frame JPEG, PNG and WebP are accepted.

Validated screenshots and their exact stage/environment are recorded in [the High-stage evidence report](evidence/HIGH-STAGE.md).

The [X1 evidence report](evidence/X1-STAGE.md#visual-evidence) records inspected desktop shop-profile and mobile account-security screenshots from the local production build. All pictured identities and shops are fictional; no authentication secrets are pictured.


## Implemented X2 private-media path

```mermaid
flowchart TD
  Merchant[Authorized merchant or granted staff] --> Reserve[Owned expiring upload session and atomic quota reservation]
  Reserve --> Upload[Bounded bytes with matching declared type and length]
  Upload --> Quarantine[(Private PostgreSQL quarantine)]
  Upload --> Job[Durable processing job in same transaction]
  Job --> Decode[Independent worker validates signature, pixels and single frame]
  Quarantine --> Decode
  Decode --> Reject[Rejected image, quarantine removed and reservation released]
  Decode --> Encode[Rotate, strip metadata and generate bounded WebP variants]
  Encode --> Fence[Recheck lease, asset version and canonical state]
  Fence --> Ready[(Private ready variants and effect receipt)]
  Ready --> Read[Current scoped authenticated thumbnail, card or display read]
  Ready --> Public[Public read rechecks eligible published shop and active product attachment]
```

Raw quarantine and the normalized rebuild source have no public or workspace download route. A pending replacement leaves the product's prior ready image attached. Referenced assets cannot be deleted; expiry cleanup and tombstones prevent delayed jobs from resurrecting deleted media.

## Implemented X2 guest-request path

```mermaid
flowchart LR
  Customer[Anonymous customer] --> Contact[Enabled contact page with canonical eligibility]
  Contact --> Submit[Exact origin, bounded body and atomic abuse budgets]
  Submit --> Check[Recheck shop and optional product under merchant lock]
  Check --> Retry{Idempotency key and fingerprint}
  Retry -->|Same request| Receipt[Return prior received receipt]
  Retry -->|New request| Commit[(Request and local notification job)]
  Commit --> Receipt
  Commit --> Inbox[Scoped merchant inbox]
  Inbox --> Ack[Acknowledge or close with version check and audit]
```

A received or acknowledged request does not confirm an order, payment or stock reservation. Private customer details stay in the scoped inbox; notification payloads contain identifiers only. Live retention and delivery policies remain owner decisions.

The [X2 evidence report](evidence/X2-P5.md) includes inspected production-browser screenshots of the [catalogue and inbox](evidence/images/x2-catalogue-desktop.png) and [anonymous contact page](evidence/images/x2-guest-contact.png). They contain fictional/sample data, without authentication secrets.


## Implemented X2 design and public eligibility

```mermaid
flowchart TD
  Editor[Current design and shop grant] --> Validate[Closed LSS schema, budgets and owned references]
  Validate --> Draft[(Immutable draft revision and audit)]
  Draft --> Preview[Authorized private preview]
  Draft --> Patch[Version-checked manual patch or restoration]
  Patch --> Draft
  Preview --> Confirm[Explicit merchant confirmation and fresh publish authority]
  Confirm --> Publish[(Atomic published pointer and audit)]
  Publish --> Read[Current canonical catalogue and contacts]
  Read --> Eligibility{Publication active, tenancy active/due/grace, moderation clear, no operations hold}
  Eligibility -->|Eligible| Public[Dynamic no-store shop, search and ready-image responses]
  Eligibility -->|Unavailable| Deny[Platform unavailable state without restricted contents]
  Publish --> Index[PostgreSQL generated search vectors in canonical transactions]
  Index --> Public
```

Restoring a layout never restores an old price/contact/payment setting. The renderer uses a read-only snapshot and current canonical resources; request-local memoization avoids duplicate metadata/page reads without a shared response cache. Future remote browser/CDN revocation and live financial/provider policies require separate evidence.

Inspected X2 prototype captures: [merchant design](evidence/images/x2-design-desktop.png), [public product with a synthetic ready image](evidence/images/x2-public-product.png) and [mobile search on the isolated 1,500-shop dataset](evidence/images/x2-architecture-search.png). See [the complete experiment and limits](evidence/X2-P6-P7.md).

## Implemented P8 development lifecycle

```mermaid
flowchart TD
  Owner[Authenticated owner] --> Draft[Versioned application and private normalized evidence]
  Draft --> Submit[Confirm submission and retain snapshot]
  Submit --> Review[Scoped reviewer with native MFA]
  Review -->|Needs information| Draft
  Review -->|Approved with reason| Invoice[Referenced invoice and immutable policy]
  Invoice --> Finance[Separately scoped finance operator with fresh MFA]
  Finance --> Check[Compare invoice reference, currency, amount and unique receipt]
  Check -->|Partial credit| Pending[Retain credit without provisioning]
  Check -->|Fully settled| Atomic[(One transaction: ledger, coverage, capacity, unpublished shop, tenancy, audit and jobs)]
  Atomic --> Workspace[Owner configures catalogue, contacts and design]
  Workspace --> Publish[Explicit publication with current authority]
  Publish --> Public[Canonical eligible public discovery and contact]
  Atomic --> Worker[Scheduled reminders using current coverage and credits]
  Worker --> Due[Due then grace then closed at the policy boundary]
  Finance --> Reverse[Linked negative correction retains original history]
  Reverse --> Debt[Arrears close eligibility and preserve shop data]
  Due --> Renewal[Verified full renewal]
  Debt --> Correct[Verified correction within original coverage]
  Renewal --> Eligibility[Recompute tenancy without changing moderation or publication]
  Correct --> Eligibility
  Eligibility --> Public
```

This is a development workflow: **UGX 5,000 per 30 days, seven days’ grace and manual operator reconciliation; live collection disabled**. Stable command keys, append-only financial events and merchant locks prevent duplicate credit/provisioning. An old job cannot carry an authoritative payment date. Only new P8 contracts enter the scheduler; previous fixtures remain unchanged. See [ADR-0006](ADR/0006-local-applications-and-rent-lifecycle.md) and [P8 verification/screenshots](evidence/X2-P8.md).

## Implemented P8 team and address continuity

```mermaid
flowchart TD
  Owner[Fresh current owner] --> Team[Bounded private team and current merchant revision]
  Team --> Command[Explicit confirmed command with expected revision]
  Command --> Lock[Merchant lock and rechecked owner authority]
  Lock --> Compare{Revision still current?}
  Compare -->|No| Conflict[Reload and review conflicting change]
  Compare -->|Yes| Commit[(Membership change, next revision and audit)]
  Commit --> Invite[Private email-bound one-use invitation]
  Invite --> Recipient[Verified recipient enters token privately]
  Recipient --> Accept[Recheck session, expiry and issuer under merchant lock]
  Accept --> Joined[Membership and next merchant revision]
  Joined --> Grant[Owner separately grants staff shop access]
  Owner --> Address[Versioned address command with reason]
  Address --> Registry[(Permanent current and former slug reservations)]
  Registry --> Resolve[Old address or immutable shop ID]
  Resolve --> Eligible{Current public eligibility?}
  Eligible -->|Yes| Redirect[Redirect to current canonical address]
  Eligible -->|No| Hidden[Unavailable without private shop disclosure]
```

Last-owner protection and issuer-invitation revocation remain active. A token is not a URL, and membership alone does not give staff shop access. The address registry is append-only; direct SQL cannot transfer an old address to another shop.

## Implemented P8 scoped operations and independent holds

```mermaid
flowchart TD
  Operator[Explicit operations grant and native MFA] --> Queue[Minimal shop queue and aggregate mall occupancy]
  Queue --> Claim[Fresh claim with reason and no merchant self-membership]
  Claim --> Scope[(Distinct operations shop scope)]
  Scope --> Command[Confirmed versioned command with reason]
  Command --> Lock[Merchant lock and current authority recheck]
  Lock --> Move[Mall move also acquires shared provisioning capacity lock]
  Move --> Capacity{Target has capacity?}
  Capacity -->|Yes| Assign[Change only mall assignment plus version and audit]
  Capacity -->|No| Refuse[Conflict without moving shop]
  Lock --> Hold[(Pause or remove independent operational hold; retain audit)]
  Hold --> Eligibility{Published design, eligible tenancy, clear moderation, no hold?}
  Rent[Canonical rent and scheduled tenancy] --> Eligibility
  Moderation[Separate trust decisions] --> Eligibility
  Publish[Explicit merchant publication] --> Eligibility
  Eligibility -->|Yes| Public[Shop, search, contact and ready media]
  Eligibility -->|No| Hidden[Public disclosure denied]
  Finance[Finance grant and claimed application-finance scope] --> Exceptions[Scoped unsettled invoice exceptions]
```

Resume removes only the hold. It cannot credit an invoice, renew rent, publish a draft or clear moderation. Capacity moves preserve identity, address, ownership, catalogue and financial history. [Administration evidence](evidence/X2-P8-ADMIN.md) records races, scoped HTTP/Flight denial, upgrade preservation and inspected [desktop team](evidence/images/x2-p8-team-desktop.png), [desktop operations](evidence/images/x2-p8-operations-desktop.png) and [mobile team](evidence/images/x2-p8-team-mobile.png) captures. All pictured data is fictional.
