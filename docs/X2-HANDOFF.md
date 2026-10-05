# X2: catalogue, contact and media implementation handoff

Prerequisite: [R1 review](evidence/R1-REVIEW.md) is complete for the existing P2–P4 foundation. Next setting: **Sol 6.1 Extra High**. The owner must confirm the model/level and say **“Continue X2”** before this dependent stage starts. This file is a work packet within the [implementation plan](IMPLEMENTATION-PLAN.md), not a replacement or a claim that P5 is complete.

## Why Extra High next

The next dependency is P5's tenant-owned catalogue, sensitive contact settings and media pipeline. These introduce new permission checks, SQL constraints, concurrent edits/quotas and untrusted-file processing. They require the X2 setting. H2 remains useful for routine pages/components after these contracts exist; no separate High stage is needed merely to change models.

## Execute in this order

1. **Resume and establish the baseline.** Read BUILD-STATUS, R1-REVIEW, CONTRACTS, DEVELOPMENT and P5–P7. Inspect the current branch and pending changes. Preserve the database volume, credentials and original migrations. Confirm schema 007 and current core readiness; run affected checks when changes begin. Public fixtures remain the current anonymous preview.
2. **Define the first P5 command contracts.** Specify department/product/service create, read, update, reorder and archive; version conflicts; availability; currency/minor units; limits and role/action permissions. Distinguish ordinary profile fields from sensitive contact/payment instructions. Define merchant and staff grants, scoped support, consistent missing-resource denials and audit payloads. Do not accept client-supplied actors or trusted tenant identifiers.
3. **Add reviewed schema and domain services.** Use a new migration, tenant-consistent foreign keys, exact integer `minor_units` values and version comparisons. Recheck authorization after serialization waits. Commit canonical changes, audit and required jobs together. Archive semantics must protect referenced records and prevent delayed jobs from resurrecting removed content. Keep old-schema upgrade fixtures alongside empty-database tests.
4. **Implement the catalogue UI against those services.** Add scoped lists and bounded pagination, department/product forms, price/availability controls, ordering, archive confirmation and conflict recovery. Include mobile, keyboard, accessible labels and useful empty/error/loading states. Private changes do not become public merely because a row exists.
5. **Implement contact and guest-request contracts.** Allowlist telephone/WhatsApp/URL schemes and structured commerce instructions. Require fresh step-up and audit for sensitive changes. Design bounded anonymous enquiry/request submission, privacy and abuse budgets; avoid implying confirmed payment, order or stock reservation. Use explicit local notification delivery until a live adapter is configured and verified. Record provisional development limits; do not invent live retention or financial policy.
6. **Implement private media ingestion before public delivery.** Establish owned upload sessions, explicit formats and byte/dimension/pixel limits, private quarantine, secure decoding and metadata removal. Reject unsafe SVG, malformed/type-mismatched/polyglot/bomb inputs. Do not add arbitrary remote fetching without a reviewed SSRF boundary. Define reference ownership, upload expiry and processing/error states.
7. **Add durable processing, quotas and cleanup.** Generate appropriate thumbnail/card/display/rebuild-source variants through the independent worker. Reserve quota atomically under concurrency. Use lease fencing and durable dedupe; stale/deleted/replaced source jobs must not publish a variant. Clean abandoned uploads and delete only when references and ownership permit it. Local private storage may prove behavior; live object storage/CDN needs separate configuration and contract evidence.
8. **Close P5 with evidence and a handoff.** Extend the protected-endpoint attack registry for every new route. Test two merchants, constrained staff, scoped operators, stale/revoked authentication, conflict races, concurrent quotas, duplicate/failed jobs, deletion during processing and private-object access. Exercise forms and processing failures in production browsers, including mobile/accessibility. Record migration preservation, dependency/secret checks, relevant performance bounds and unresolved policies. Update BUILD-STATUS and RECOMMENDATIONS before changing stages.

## Acceptance and containment

- The 75-test R1 foundation stays passing; new security/concurrency tests exercise actual PostgreSQL and real handlers. A UI-hidden control is never the authorization mechanism.
- Upload/raw/draft assets stay private. Only validated ready variants may enter a later authorized public rendering path. Tenant identifiers and guessable URLs do not grant object access.
- Preserve the existing anonymous fictional preview until P6/P7 supply public eligibility and cache-revocation contracts. Catalogue persistence alone does not complete public discovery or publication.
- Provider outages create bounded, visible retry/failure states without corrupting canonical data or quotas. Add no unverified live-provider claims.
- Review any new dependency and lockfile change. Use migrations with upgrade evidence; production publication, remote pushes and live financial operations are not implied by this local work packet.

## Remaining sequence

After P5, continue the Annette vertical slice through P6 (safe LSS/manual design, preview, publication) and P7 (eligible public PostgreSQL discovery, targeted invalidation and the architecture benchmark), then close G2. Those boundaries also warrant Sol 6.1 Extra High. P8 rent/provisioning/reconciliation and P10 AI require their own sensitive contracts and policy/provider gates; P9 trust/analytics and P11/P12 performance/recovery/release remain in the master plan. R2 uses **6 Astra Extra High** to review the completed system and release evidence before a separately authorized deployment.

If a critical architecture issue remains unresolved, record the concrete decision and evidence, then request the Astra Extra High handoff. Do not switch models invisibly or claim the complete build is finished after one work packet.
