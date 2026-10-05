# Build status and next model setting

Updated 2026-10-05, Africa/Kampala. Branch: `codex/londos-x2-2026-10-05`.

**X2 P5–P7 local architecture prototype: COMPLETE and verified.** The owner confirmed **Sol 6.1 Extra High**, authorized committing/pushing finished work to a new branch and instructed “Continue X2.” The assistant records that requested setting; it cannot inspect/change the selector. H (`e65748e`), X1 (`c93261f`) and R1 (`cc0aafc`) were preserved and pushed unchanged; P5 was pushed separately as `c19a26a`.

The prototype supports tenant-owned catalogue/contact/private uploads and guest requests, safe manual LSS drafts/patches/private preview, immutable revisions with explicitly confirmed publication/restore, canonical PostgreSQL public shops/ready images and bounded shop-first search. Both fixture and configured local database modes are supported. Read [current evidence](evidence/X2-P6-P7.md), [P5 evidence](evidence/X2-P5.md) and [ADR-0005](ADR/0005-safe-design-and-canonical-public-reads.md).

## Verification

- **130 passing tests:** 22 unit, 81 real PostgreSQL integration, 16 fixture public browser and 11 core browser tests. Original identity/MFA/security/crash and P5 tests remain passing. Six new protected design methods join the HTTP tenant-attack registry.
- Lint, strict types, formatting, documentation links, standalone web/independent worker build and configured-secret artifact scan passed. Dependency audit: **0 vulnerabilities**. Artifact scan: **657 files / 8 candidate values**, with no values printed.
- [Migration 008→009](evidence/X2-P6-MIGRATION.json) preserved existing canonical fields for 1,506 shops / 150,004 products / 1,504 departments, repeated migration/seed and application credentials. Local elapsed time: 1,407 ms; backup restore/production downtime are unverified.
- [Architecture experiment](evidence/X2-BENCHMARK.json): 1,506 shops / 150,004 products / 9,004 departments; four CPUs / 32 GiB cgroup limit. All six slices and declared budgets passed: search p95 **89.54 ms**, 20-client/200-request read burst p95 **524.40 ms**, zero errors, worker-ready **259.17 ms**. These are short loopback measurements, not sustained capacity/mobile-network/production guarantees.
- Matching main web/worker run against schema 009 with canonical local public browsing. See [runtime evidence](evidence/X2-LOCAL-RUNTIME.json). Live delivery and financial capabilities remain false. Private configuration, credentials and notification files stay ignored.

## Next work and model

Continue **X2 / P8 at Sol 6.1 Extra High** using [X2-HANDOFF](X2-HANDOFF.md) and the [master plan](IMPLEMENTATION-PLAN.md). Keep the already confirmed setting for tenancy/rent/provisioning/reconciliation and later AI boundaries. No new switch is required now. Use **6 Astra Extra High** for R2's final system/release review, or an earlier concrete unresolved critical architecture issue.

G2's local six-slice experiment is accepted within its explicit limits. Full-build gates remain open: wider LSS components/public catalogue pagination; applications/operator workflows; live rent/providers; trust/reporting/analytics; AI; sustained mixed-load/recovery/release evidence. Current public department views initially return 20 products and entrances at most 32 cards. English search does not claim advanced typo/multilingual relevance. Production deployment remains separate.

## Environment and persistence

The new branch preserves finished changes and their tests, evidence and documentation. The P6/P7 packet is committed/pushed after final checks; inspect Git for the exact current SHA. No force push or production deployment is part of this task.

Reusable installation/startup instructions and repository membership are saved through the onboarding draft workflow. Review/save settings and publish the environment to activate that configuration. A draft does not execute scripts, restart processes or prove fresh-task restoration/Docker volume persistence. Current runtime and remote Git availability are separate evidence.

## Remaining gates

| Boundary | State |
|---|---|
| H / X1 / R1 | Completed foundation and reviewed local security boundary; historical evidence retained. |
| P5 | Local catalogue/contact/request/media complete; eligible responsive ready-media delivery now verified through P6/P7. Operator browser recovery and live policies/providers remain later work. |
| P6/P7 / G2 | Local safe-design/public-discovery prototype and six-slice experiment complete within recorded limits. Wider registry/pagination/deployment-specific cache evidence remain full-build obligations. |
| P8–P10 | Next: complete merchant/landlord lifecycle, rent/reconciliation, trust/analytics and scoped provider-neutral AI. |
| P11/P12 / R2 | Full-load, production roles/deployment, backup/restore, release dossier and Astra Extra High review remain open. |

**The X2 P5–P7 prototype is done at Sol 6.1 Extra High. Next is P8 at the same setting; the complete application and production release are still in progress.**
