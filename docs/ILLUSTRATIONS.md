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

X1 implements local PostgreSQL, the initial session/MFA/permission boundary and the durable worker. X2 adds catalogue/contact commands, guest requests and private worker media processing. The P6/P7 prototype adds safe LSS/publication, canonical PostgreSQL search and eligible public image delivery. Rent, live providers, the wider renderer registry and AI remain later stages. The complete diagram is the intended system, not a claim that every component is ready.

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
  P7 --> Next[Continue plan gates and later Astra R2 review]
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
  Read --> Eligibility{Publication active, tenancy active/due/grace, moderation clear}
  Eligibility -->|Eligible| Public[Dynamic no-store shop, search and ready-image responses]
  Eligibility -->|Unavailable| Deny[Platform unavailable state without restricted contents]
  Publish --> Index[PostgreSQL generated search vectors in canonical transactions]
  Index --> Public
```

Restoring a layout never restores an old price/contact/payment setting. The renderer uses a read-only snapshot and current canonical resources; request-local memoization avoids duplicate metadata/page reads without a shared response cache. Future remote browser/CDN revocation and live financial/provider policies require separate evidence.

Inspected X2 prototype captures: [merchant design](evidence/images/x2-design-desktop.png), [public product with a synthetic ready image](evidence/images/x2-public-product.png) and [mobile search on the isolated 1,500-shop dataset](evidence/images/x2-architecture-search.png). See [the complete experiment and limits](evidence/X2-P6-P7.md).
