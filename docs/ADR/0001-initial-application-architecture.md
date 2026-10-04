# ADR-0001: Initial Application Architecture

- **Status:** Superseded by [ADR-0002](0002-nextjs-node-application-architecture.md) and the explicit Next.js / Node master build instruction. Retained as architectural history.
- **Date:** 2026-10-04
- **Decision:** Django 6 modular monolith for the first Londos implementation

## Context

Londos is still pre-pilot. The architecture must support the digital-mall domain without spending scarce engineering and hosting resources on distributed-system complexity before demand exists.

The Shop Specification (LSS) deliberately separates public rendering from canonical commerce data, which gives us freedom to replace or augment the renderer later.

## Decision

Build the first vertical prototype as a **Django 6 modular monolith backed by PostgreSQL**.

Use clear domain modules for:
- identity;
- applications/verification;
- malls/shops/tenancy;
- catalogue;
- shop design/LSS;
- discovery/search;
- media;
- rent;
- trust/moderation;
- analytics;
- landlord operations.

Public Mall, Shopkeeper and Landlord are separate product surfaces, but initially can share one deployable application with strict authorization boundaries.

## Why

- minimizes deployments/runtimes during validation;
- strong relational/domain fit;
- mature authentication, ORM, migrations and admin capabilities;
- server rendering suits low-bandwidth public shops;
- Python aligns with future AI/design work;
- LSS prevents framework lock-in at the storefront layer.

## Consequences

### Positive
- faster pilot implementation;
- fewer failure boundaries;
- lower early hosting/operations cost;
- easier transactional consistency;
- Django admin can accelerate internal operational tooling.

### Negative
- advanced visual design tooling may later require a richer frontend;
- production task execution still requires worker infrastructure;
- discipline is required to keep domain modules separate inside one codebase.

## Revisit triggers

Re-evaluate this ADR if:
- LSS designer interaction is materially constrained;
- measured public performance fails targets;
- independent frontend deployment becomes necessary;
- team growth requires frontend/backend separation;
- scaling measurements show a genuine service boundary bottleneck.

## Validation

ADR becomes **Accepted** only after the vertical benchmark defined in `docs/STACK-COMPARISON.md` passes.
