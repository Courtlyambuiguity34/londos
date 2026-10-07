# Model and execution recommendations

The owner requested explicit model handoffs on 2026-10-04. Follow these stages when executing [the implementation plan](docs/IMPLEMENTATION-PLAN.md). The model choices are a workflow recommendation, not a measured comparison on this repository.

**Current progress (2026-10-06, Africa/Kampala):** H/X1/R1 and local P5–P11 work are preserved. **R2 is complete at owner-confirmed 6 Astra Extra High:** six reproduced defects fixed, 390 tests pass, schema 018 unchanged. Read [R2 review](docs/evidence/R2-REVIEW.md), [BUILD-STATUS](docs/BUILD-STATUS.md) and [X2-HANDOFF](docs/X2-HANDOFF.md). P11's local G4 remains accepted with external conditions; G5/release is open. **Next reminder: select Sol 6.1 Extra High for P12 release preparation and report the switch.** Provider variables/pricing are checked, but secure key bindings and live contracts remain unavailable; the recommended OpenAI model correction is documented. Actual device/screen-reader sessions, P9.8 governance/physical backups and partial P8 accounting remain explicit. Development rent stays UGX 5,000/30 days, seven-day grace/manual reconciliation, live collection disabled.

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

R1 selected X2 for new authorization, concurrency and media controls. The local catalogue, safe design/publication, discovery, P8 lifecycle/administration and P9 trust/incident/analytics/privacy/cost-reporting packets are now verified. P10/P11 are locally verified; R2 reviewed the completed system and remaining live provider/privacy/release conditions at the owner-confirmed Astra Extra High setting. P12 implementation should use Sol 6.1 Extra High, with Astra Extra High for the final recovery/security dossier review when required. Cost snapshots and reported work do not prove actual provider charges or complete all P9 legal/release obligations. H2 is a conditional stage for routine interface work once contracts are stable, not a required detour. The completed R2 review does not close G5. Request a further Astra handoff if P12 reveals a critical architecture decision or the final recovery/security dossier needs review.

## P12 handoff (2026-10-07)

P12 local release preparation is complete; read the [dossier](docs/evidence/P12.md) and [runbook](docs/RELEASE-RUNBOOK.md). The latest explicitly reported selector is **6 Astra Extra High**. Sol 6.1 Extra High was recommended for this implementation, but no new selector confirmation was received. The owner's repeated “Continue/finish P12” authorized completing the work without blocking on the advisory model question. Do not claim the assistant switched models or that a Sol confirmation occurred.

**Next recommendation: Astra Extra High for the final G5 recovery/security dossier review when required.** If the owner is still at the reported Astra setting, no switch is needed. Production launch remains blocked by the dossier's concrete external conditions and separate authorization; P13 follows an authorized launch, not simply a completed local drill.

## Handoff and reminder procedure

1. Read [BUILD-STATUS](docs/BUILD-STATUS.md) at the start of each turn. It is the persistent record of completed work, evidence and the next model setting.
2. Complete the currently authorized stage, run its meaningful checks, and save an honest progress report.
3. At a model boundary, update BUILD-STATUS and end the response with an explicit reminder. For example: **“Sol 6.1 High work is complete. Please switch to Sol 6.1 Extra High and say ‘Continue X1.’”**
4. Record explicit owner setting confirmations and never infer a switch from elapsed time. Model recommendations do not override the owner’s authorization to continue useful work. Ask only when a setting answer is actually necessary; do not repeatedly request an already confirmed selector.
5. The assistant cannot operate the owner's model selector or verify its UI setting. Record the setting the owner reports; do not pretend to have switched it programmatically.
6. Recheck repository state and the latest evidence after resuming. Continue the existing branch/checkout and preserve completed work.
7. Give the same explicit handoff for required Astra reviews. The owner controls those model changes; no automatic background reminder or autonomous model switching is promised.

## Scope of the first High stage

Stage H establishes the executable web foundation and demonstrates the anonymous discovery/department/product journey with visibly fictional fixtures. It does not claim to complete PostgreSQL, authentication/MFA, private workspaces, rent, tenant-isolation guarantees, LSS publication, uploads or live AI providers. Those remain in the plan and are implemented under the later settings.

An owner instruction to build the application authorizes development and local validation. Production deployment still follows the explicit authorization requirement in [prompt.txt](prompt.txt).
