# Londos build status and model handoff

Updated: **2026-10-05 (Africa/Kampala)**. Branch: `codex/londos-x2-2026-10-05`.

## Current stage

**X2 / first P5 local work packet: COMPLETE and verified.** The owner authorized pushing finished work to a new branch, then instructed “Continue X2” for the recorded **Sol 6.1 Extra High** workflow. The assistant cannot inspect/change the model-selector UI.

H (`e65748e`), X1 (`c93261f`) and R1 (`cc0aafc`) were pushed unchanged first. X2 adds tenant-scoped catalogue editing, exact-price display, sensitive contact settings, scoped operator support/recovery, anonymous bounded requests and a private inbox, owned image uploads, concurrent quotas, worker processing/variants, retries and cleanup. See [X2 evidence](evidence/X2-P5.md) and [ADR-0004](ADR/0004-catalogue-contact-and-private-media.md).

This completes the first local P5 packet. Public Mall/Shop rendering remains a fictional fixture preview. The enabled canonical contact page accepts requests separately. Public image delivery, LSS design/publication and PostgreSQL discovery remain P6/P7; live providers, financial operations, AI and production release remain later gates.

## Next work and model

Continue **X2 at Sol 6.1 Extra High** with P6: strict safe shop specifications, manual templates/design, private preview and concurrent publication. Then P7 supplies eligible public PostgreSQL discovery, revocation/invalidation and the architecture benchmark. Use [X2-HANDOFF](X2-HANDOFF.md) and the master [implementation plan](IMPLEMENTATION-PLAN.md).

No new model switch is required between these packets. H2 is available for bounded routine UI against stable interfaces. **6 Astra Extra High R2** remains the system/release review; request an earlier Astra handoff if a critical architecture decision remains unresolved.

## Current evidence

- **105 passing tests:** 19 unit, 62 real PostgreSQL integration, 16 public browser and 8 core browser tests. Original R1 security/crash tests remain passing; 23 new domain cases and three new browser flows cover the P5 boundary.
- Lint, strict types, formatting, documentation links, production Next/worker build and configured-secret artifact scan passed. Full dependency audit: **0 vulnerabilities**. Artifact scan: **564 files / 8 candidate values**, no values printed.
- [Migration 007→008](evidence/X2-MIGRATION.json) preserved existing canonical fields for **1,506 shops, 150,004 products and 1,504 departments**, repeated migrations/seed and application credentials. Local elapsed time: **566 ms**; this is not backup restoration or a production downtime guarantee.
- Production desktop/mobile flows and visual evidence: [X2-P5](evidence/X2-P5.md). A real compiled worker processes valid images, rejects unsafe replacements, and preserves the prior attached image.
- Earlier evidence remains in [R1-REVIEW](evidence/R1-REVIEW.md), [X1-STAGE](evidence/X1-STAGE.md), [X1 runtime](evidence/X1-RUNTIME.json) and the High report. Dataset generation is not a load benchmark.
- PostgreSQL **18.6**, pg **8.23.1**, Better Auth **1.7.7**, Sharp **0.35.5** are pinned. Migration checksums remain enforced; startup never auto-migrates.
- Local notification/private storage behavior is verified. Live notifications and financial operations remain false; remote guest operation is also blocked pending verified providers/configuration.
- Changes are committed/pushed to the new branch. Remote CI outcomes and production deployment remain unverified; no deployment occurred.
- Reusable startup instructions are saved as a cloud configuration draft. Review/save in environment settings and publish to activate. Fresh-task/volume restoration remains unverified.

## Plan coverage

| Phase | Status |
|---|---|
| P0–P4 | Initial local foundation implemented, reviewed and tested; extend contracts for each new domain and production control. |
| P5 | Local catalogue/contact/request/private-media packet implemented and tested. Public media delivery/responsive rendering, operator browser recovery, live providers and policies remain assigned later. |
| P6–P7 | Next: safe manual LSS/preview/publication, eligible public PostgreSQL discovery/cache revocation and architecture benchmark. G2 remains open. |
| P8–P12 | Rent/provisioning/trust/analytics/AI, production controls/providers, performance/backup restoration and release remain planned. |
| P13 | Requires an authorized release and real merchant cohort. |

## Reminder

**The X2 P5 packet is done. Continue X2/P6 using Sol 6.1 Extra High; keep that setting for sensitive design/publication and eligibility work.** Stage evidence does not establish complete-build or production readiness.
