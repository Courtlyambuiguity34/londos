# Data Model & Multi-Tenancy

## Canonical hierarchy

```text
Platform → Mall → Shop → Department → Product/Service
```

A shop is the primary tenant boundary.

## Identity

Every shop receives an immutable internal identifier, for example:

`SHOP-UG-00000451`

A shop may also have a mutable human-readable slug. URLs and names can change without changing ownership/history relationships.

All shop-scoped records should carry or be unambiguously derivable to `shop_id`. Mall-scoped records likewise use `mall_id`.

## Conceptual entities

- users / identities
- merchant organizations and memberships
- malls
- shop applications
- shops
- shop memberships/roles
- shop designs/configurations
- departments
- products/services
- product media
- inventory/availability where applicable
- contact/commerce settings
- enquiries/messages
- rent accounts
- rent invoices/payments/status
- verification records
- reports/moderation cases
- audit events
- shop/customer analytics events
- search documents/index projections

## Isolation rule

Do **not** create a separate table or ad-hoc database section for every merchant. Use tenant-aware schemas/tables with strict authorization and indexes.

Every shopkeeper operation should effectively answer both:
1. Is this authenticated actor permitted to perform this action?
2. Is the target resource owned by a shop this actor is authorized to operate?

Never rely on a hidden URL or client-provided `shop_id` alone.

## Suggested relationship sketch

```text
Mall 1 ──< Shop
Shop ──< Department ──< Product
Shop ──< ShopMember >── User
Shop ──< Media
Shop ──< Enquiry
Shop ──1 RentAccount ──< RentEvent
Shop ──< Report
Shop ──< AuditEvent
```

## Search projection

Search should use a purpose-built projection/index rather than forcing public discovery to perform expensive joins over transactional tables at high scale. A search document can contain only safe public fields needed for ranking/filtering and routing into the correct shop context.

The transactional database remains canonical.

## Deletion/closure

Tenancy state must be separate from data destruction. A shop can be:
- pending;
- active;
- grace;
- temporarily closed;
- suspended;
- archived;
- permanently removed under policy.

Non-payment should not automatically equal immediate irreversible deletion.

## Open data decisions

- merchant identity model;
- staff roles/permissions;
- product variant/inventory model;
- service-business representation;
- message retention;
- analytics retention;
- rent ledger design;
- deletion/export policies;
- location model;
- multi-country identifiers/currencies.
