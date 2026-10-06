# Model and execution recommendations

The owner requested explicit model handoffs on 2026-10-04. Follow these stages when executing [the implementation plan](docs/IMPLEMENTATION-PLAN.md). The model choices are a workflow recommendation, not a measured comparison on this repository.

**Current progress (2026-10-06, Africa/Kampala):** H, X1, R1 and local P5–P10 work are preserved. **P11 implementation/local gate is complete at Sol 6.1 Extra High; 372 tests pass, schema 018, G4 accepted with external conditions.** [P11 evidence](docs/evidence/X2-P11.md) records bounded semantic spaces, full catalogue continuation, clean upgrade, two-replica load/recovery and actual provider status. **Next reminder: select 6 Astra Extra High for R2 final system/release review and report the switch before R2 begins.** [BUILD-STATUS](docs/BUILD-STATUS.md) and [X2-HANDOFF](docs/X2-HANDOFF.md) preserve this boundary. Live key/model/rate/quality/billing checks, actual device/screen-reader sessions, P9.8 legal/full subject-access/physical backups, partial accounting/arrangements and G5 release remain open. Development rent stays UGX 5,000/30 days, seven-day grace/manual reconciliation, live collection disabled.

## Model settings

| Stage | Model / reasoning | Work |
|---|---|---|
| H: foundation and ordinary interface work | Sol 6.1 / High | Reconcile the explicit stack instruction; project setup, public interface with labeled fixtures, reusable accessible components, routine tests, CI, diagrams and setup documentation. |
| X1: secure infrastructure | Sol 6.1 / Extra High | P2–P4: PostgreSQL schema/migrations, identity, MFA, permissions, tenant isolation, durable jobs and transactions. |
| R1: review the security boundary | 6 Astra / Extra High | Review state/permission/data contracts and X1 security evidence before private features depend on them. |
| H2: ordinary feature implementation | Sol 6.1 / High | Routine pages, forms and component work using reviewed domain interfaces. Ask for a setting change when the next task crosses into an Extra High boundary. |
| X2: sensitive feature implementation | Sol 6.1 / Extra High | Begin P5 catalogue/contact/media: new permissions, concurrent edits/quotas and upload security. Continue sensitive LSS/publication, rent/provisioning/reconciliation, cache eligibility and AI boundaries as the plan reaches them. |
| R2: final critical review | 6 Astra / Extra High | Full-system security, migration/rollback, recovery and release evidence; difficult unresolved architecture problems. |

Model settings do not replace tests, acceptance gates, review or recovery. Use High for routine work and Extra High at the listed boundaries; Max/Ultra is not the default.

R1 selected X2 for new authorization, concurrency and media controls. The local catalogue, safe design/publication, discovery, P8 lifecycle/administration and P9 trust/incident/analytics/privacy/cost-reporting packets are now verified. P10/P11 are locally verified; R2 reviews the completed system and remaining live provider/privacy/release conditions at Astra Extra High. Cost snapshots and reported work do not prove actual provider charges or complete all P9 legal/release obligations. H2 is a conditional stage for routine interface work once contracts are stable, not a required detour. R2 remains the final Astra Extra High review; request an earlier Astra handoff if a critical architecture decision remains unresolved.

## Handoff and reminder procedure

1. Read [BUILD-STATUS](docs/BUILD-STATUS.md) at the start of each turn. It is the persistent record of completed work, evidence and the next model setting.
2. Complete the currently authorized stage, run its meaningful checks, and save an honest progress report.
3. At a model boundary, update BUILD-STATUS and end the response with an explicit reminder. For example: **“Sol 6.1 High work is complete. Please switch to Sol 6.1 Extra High and say ‘Continue X1.’”**
4. At a requested model change, wait for the owner’s setting confirmation before executing dependent work. Continue packets within an already confirmed setting without requesting it again. Do not infer a switch from elapsed time.
5. The assistant cannot operate the owner's model selector or verify its UI setting. Record the setting the owner reports; do not pretend to have switched it programmatically.
6. Recheck repository state and the latest evidence after resuming. Continue the existing branch/checkout and preserve completed work.
7. Give the same explicit handoff for required Astra reviews. The owner controls those model changes; no automatic background reminder or autonomous model switching is promised.

## Scope of the first High stage

Stage H establishes the executable web foundation and demonstrates the anonymous discovery/department/product journey with visibly fictional fixtures. It does not claim to complete PostgreSQL, authentication/MFA, private workspaces, rent, tenant-isolation guarantees, LSS publication, uploads or live AI providers. Those remain in the plan and are implemented under the later settings.

An owner instruction to build the application authorizes development and local validation. Production deployment still follows the explicit authorization requirement in [prompt.txt](prompt.txt).
