# Infrastructure & Scaling

## Principle

**Architect for millions; deploy for hundreds; pay for what exists today.**

## Initial production direction

A sensible production shape is:

```text
Internet
  ↓
CDN / edge protection
  ↓
Public application/API
  ├── relational production database
  ├── cache
  ├── search capability
  ├── worker/queue
  └── object/media storage + CDN

Private:
  ├── Shopkeeper
  └── Landlord

Recovery:
  ├── cloud/provider backups
  └── encrypted off-site copy controlled by Londos
```

The exact vendors are intentionally undecided.

## Mini-PC role

A modern mini PC can be useful for:
- development;
- staging/internal tools;
- encrypted backup replication;
- disaster-recovery copy;
- analytics/archive workloads;
- controlled pilot services.

It should **not** be the only production host for a mall with large merchant dependency. A single room/PC introduces correlated risks: electricity, ISP/upload capacity, router, public networking, SSD, theft, fire/water and physical maintenance.

## Hybrid control

A strong early model is cloud-hosted public availability plus encrypted backups replicated to owner-controlled hardware. This provides practical availability while retaining an independent data-recovery copy.

Sensitive data is not automatically safer merely because the disk is physically nearby; encryption, access control, MFA, network isolation, secrets management and tested recovery matter.

## Growth path

### Stage 0 — prototype
Local/dev deployment, synthetic/sample data, architecture validation.

### Stage 1 — pilot
10–20 real shops. Managed/simple production infrastructure. Measure usage and economics.

### Stage 2 — early mall
Hundreds of shops. Improve observability, cache/search/media pipeline and backup discipline.

### Stage 3 — multi-mall
Multiple logical malls, global search, operational partitioning. Scale services based on measured bottlenecks.

### Stage 4 — high scale
Shard/partition databases and search by stable boundaries when necessary; add replicas and service separation where evidence demands it.

### Stage 5 — dedicated infrastructure if justified
Professional data-centre deployment may become appropriate: redundant power, connectivity, cooling, physical security, fire protection, database replication and disaster recovery.

Do not reproduce a data centre in a bedroom.

## Logical vs physical mall

A logical mall's ~1,500-shop target does not make a page fast by itself. Performance comes from indexes, scoped queries, caching, pagination, media optimization and distribution.

Later, logical malls provide useful shard keys/boundaries, e.g. groups of malls on separate clusters, while customers continue to experience one Londos.
