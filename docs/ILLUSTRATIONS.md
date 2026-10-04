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

PostgreSQL, the security boundary, durable worker, LSS publication and AI are planned for the later model stages. Their appearance in the diagram does not claim they are implemented.

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
