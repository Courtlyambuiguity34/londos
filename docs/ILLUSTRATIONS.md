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

X1 implements local PostgreSQL, the initial session/MFA/permission boundary and the durable worker. Public PostgreSQL eligibility/search, media processing, rent workflows, LSS publication and AI remain later stages. The complete diagram is the intended system, not a claim that every component is ready.

## Implemented X1 identity and mutation boundary

```mermaid
flowchart TD
  Login[Password and verified email] --> Challenge{MFA enrolled?}
  Challenge -->|Yes| Factor[TOTP or unused recovery code]
  Factor --> Proof[Server proof bound to current session]
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
  Astra --> Next[Continue approved feature stages]
```

The assistant records the next setting in BUILD-STATUS. The owner operates the model selector; the assistant does not switch it automatically.

## Local artwork inventory

- `mall.svg`: independent shops around a shared courtyard.
- `shop-*.svg`: six category-specific sample storefronts.
- `product-*.svg`: ten product/service illustrations, marked as samples.

The application renders these fixed trusted SVGs with explicit dimensions and lazy loading except for initial hero/product art. Arbitrary tenant SVG uploads are not enabled; their validation policy belongs to the media-security stage.

Validated screenshots and their exact stage/environment are recorded in [the High-stage evidence report](evidence/HIGH-STAGE.md).

The [X1 evidence report](evidence/X1-STAGE.md#visual-evidence) records inspected desktop shop-profile and mobile account-security screenshots from the local production build. All pictured identities and shops are fictional; no authentication secrets are pictured.
