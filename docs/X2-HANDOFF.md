# Londos continuation handoff

**Current hosted follow-up — 26 October 2026:** work targets
`feature/hosted-lifecycle-secure-2026-10-23`, continuing from `61e0f47`, with readiness migration
**036**. The [theme/editor checkpoint](evidence/THEMES-2026-10-26.md) preserves the
new design work; final browser verification is still in progress. Read the
[shop images and workspace update](evidence/SHOP-IMAGES-AND-WORKSPACES-2026-10-26.md),
[image and navigation guide](SHOP-APPEARANCE.md), [clean shop URL correction](evidence/SHOP-ADDRESSES-2026-10-25.md),
[second workflow pass](evidence/HOSTED-WORKFLOWS-FOLLOWUP-2026-10-25.md),
[first hosted workflow audit](evidence/HOSTED-WORKFLOWS-2026-10-25.md) and
[billing/shop operations](HOSTED-BILLING-AND-OPERATIONS.md) for the current implementation,
verification results and remaining operator actions. Older branch names, schema numbers,
missing-credential statements and local-only workflow descriptions below are historical.
The original formal release/pilot gates are not relabelled complete by this follow-up.


**Latest feature follow-up (2026-10-09):** the launcher/designer and P13/provider lines are consolidated on `feature/cross-platform-local-launchers-2026-10-09`. Both 019 migrations remain unchanged and 020 verifies their combined contract. Read [cross-platform evidence](evidence/CROSS-PLATFORM-LAUNCHERS-2026-10-09.md), [local launchers](LOCAL-INSTALLATION.md), [shared-server deployment](CROSS-PLATFORM-DEPLOYMENT.md), and the [designer review](SHOP-DESIGNER-REVIEW.md). Redis stays optional. Historical G5 evidence does not by itself verify this new source; the broad release gate remains pending.

**The P13/G5 development packet is complete; production launch and real pilot outcomes are conditional.** Read [BUILD-STATUS](BUILD-STATUS.md), [current dossier](evidence/G5-P13.md), [verification](evidence/G5-VERIFICATION.json), [launch status](evidence/G5-STATUS.json), [deployment profiles](DEPLOYMENT-PROFILES.md) and [pilot runbook](PILOT-RUNBOOK.md). Preserve the existing branch `codex/londos-x2-2026-10-05`, all private files and completed P12/earlier work. Do not recreate or overwrite completed evidence.

The owner explicitly corrected the database plan: keep PostgreSQL active and do not migrate it to MongoDB. Schema 019 is additive; 001–018 are unchanged and all 019 checksums are now frozen. Twelve authorized fictional merchants have unpublished/pending shops, no operator privileges and no invented payments. Their private credentials are in `.local/demonstration-accounts.json`; fresh-MFA operations controls can retire registered demo accounts while preserving history. The original canonical catalogue, designs, finance and native credential file were verified unchanged.

MongoDB is a manually invoked bounded public catalogue copy, with Cloudinary normalized image links. It is not canonical interchange, failover or live rendering. Redis has connection verification only. All optional flags default false; migration=true and unsupported database engines fail closed. Real service credentials remain absent. Local-PC and review-only Render free web instructions explain the independently supervised worker, PostgreSQL reachability, secret/TLS and live-policy boundaries.

Brevo supplies guarded remote notification delivery, durable receipt/lease/payload fencing and conservative one-attempt handling. Timeout or rejected/interrupted delivery needs operator reconciliation. Sender `mnelsontravor@gmail.com / Londos` is proposed; no key/sender/inbox validation or live email occurred. Local notifications remain private. Other live lifecycle/privacy/analytics, registration, trusted ingress and full subject-rights/recovery obligations remain launch work.

The current packet verifies 464 unique tests (122 unit, 279 PostgreSQL, 16 fixture browser, 47 compiled core browser), zero audit vulnerabilities, build/static checks, configured-value artifact scans and a new schema-019 physical rehearsal with 16 named assertions. See the exact reports for scope and identities. The image's web/worker/monitor/migration inputs match the implementation; later additions are host CLI/test/documentation changes. Old P12 recovery and images remain historical. Same-host backup/key copies are not independent recovery infrastructure. A schema-019 rollback to the prior P12 image was exercised only with local adapters and preserved financial history; never use that image to handle new remote Brevo effects or re-enable retired demonstrations.

P13 tooling provides preregistration, closed private input journals, exact net economics, the first actual paid-renewal outcome and honest missing-cost/sample limits. The initial report is insufficient-evidence; do not fill it with fake recruitment, consent, assistance, renewals or bills. Numeric thresholds remain proposals. G5's source-bound manifest keeps real requirements pending; only independently reviewed live evidence may satisfy them. It never deploys or publishes.

Latest explicitly reported model is **6 Astra Extra High**; no switch/reminder is needed if it remains selected. The assistant cannot inspect the selector. Continue closing actual launch conditions and then gather a genuine pilot, preserving PostgreSQL/native MFA/tenant authority/immutable history/current eligibility/privacy exclusions and separate AI preview/apply/publication. Development rent remains UGX 5,000/30 days/seven-day grace/manual reconciliation; all live collection and main remote AI/analytics/erasure remain off.

Read [cloud startup](CLOUD-STARTUP.md) and [cloud configuration evidence](evidence/G5-CLOUD-CONFIG.json) before claiming activation. A saved draft is not published settings or proof of fresh-machine restoration. Inspect services before starting duplicates. Prior [P12](evidence/P12.md), [R2](evidence/R2-REVIEW.md), [P11](evidence/X2-P11.md), [P10](evidence/X2-P10.md) and the deferred designer brief remain preserved.
