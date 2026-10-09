# Model and execution recommendations

## Terminology clarification

“Selected model” means the configured Gemini/OpenAI model used for an explicitly consented remote
design request. “Provider quota” means that external account's request/token allowance. It does not
select a Londos module or database and it is not the mall's planning capacity. Londos also reports
separate mall-capacity and media-quota values. The application deliberately does not rotate API keys
or switch providers to evade an exhausted provider quota; deterministic/manual design remains
available.

For deployment, retain one protected Londos web/API gateway with three role-specific PWA entry
points. Keep PostgreSQL canonical for the current implementation. MongoDB/Cloudinary are optional
public-copy services, not a drop-in replacement. An owned mini PC can become a later server after a
stable HTTPS origin, private database networking, supervision, power, monitoring and tested backups
exist. See [cross-platform deployment](docs/CROSS-PLATFORM-DEPLOYMENT.md).

**Next comprehensive review:** use Sol 6.1 Extra High after the preserved designer/provider branches are consolidated with a new additive migration. First run the real Atlas check once MONGODB_URL is delivered; current targeted provider results do not establish live credentials or G5 release readiness. Keep Redis optional. Read [current verification](docs/evidence/SERVICES-2026-10-07.md) and [designer review](docs/SHOP-DESIGNER-REVIEW.md). The assistant cannot switch the model selector or infer that a switch occurred.

The owner requested explicit model handoffs on 2026-10-04. Follow these stages when executing [the implementation plan](docs/IMPLEMENTATION-PLAN.md). The model choices are a workflow recommendation, not a measured comparison on this repository.

**Current progress (2026-10-07, Africa/Kampala):** P12 and all earlier packets are preserved. The [P13/G5 development packet](docs/evidence/G5-P13.md) adds demonstration administration, optional service provisions, guarded Brevo delivery and pilot/launch reporting. PostgreSQL stays active and no MongoDB migration occurs. Real production/pilot acceptance remains conditional. **Latest reported setting: 6 Astra Extra High; retain it for critical review if still selected.** No selector change is required or invented. [BUILD-STATUS](docs/BUILD-STATUS.md) records verified tests and concrete remaining work. Development rent remains UGX 5,000/30 days, seven-day grace/manual reconciliation, live collection disabled.

## Model settings

| Stage                                     | Model / reasoning    | Work                                                                                                                                                                                                                                |
| ----------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H: foundation and ordinary interface work | Sol 6.1 / High       | Reconcile the explicit stack instruction; project setup, public interface with labeled fixtures, reusable accessible components, routine tests, CI, diagrams and setup documentation.                                               |
| X1: secure infrastructure                 | Sol 6.1 / Extra High | P2–P4: PostgreSQL schema/migrations, identity, MFA, permissions, tenant isolation, durable jobs and transactions.                                                                                                                   |
| R1: review the security boundary          | 6 Astra / Extra High | Review state/permission/data contracts and X1 security evidence before private features depend on them.                                                                                                                             |
| H2: ordinary feature implementation       | Sol 6.1 / High       | Routine pages, forms and component work using reviewed domain interfaces. Ask for a setting change when the next task crosses into an Extra High boundary.                                                                          |
| X2: sensitive feature implementation      | Sol 6.1 / Extra High | Begin P5 catalogue/contact/media: new permissions, concurrent edits/quotas and upload security. Continue sensitive LSS/publication, rent/provisioning/reconciliation, cache eligibility and AI boundaries as the plan reaches them. |
| R2: final critical review                 | 6 Astra / Extra High | Full-system security, migration/rollback, recovery and release evidence; difficult unresolved architecture problems.                                                                                                                |

Model settings do not replace tests, acceptance gates, review or recovery. Use High for routine work and Extra High at the listed boundaries; Max/Ultra is not the default.

R1 selected X2 for new authorization, concurrency and media controls. The local catalogue, safe design/publication, discovery, P8 lifecycle/administration and P9 trust/incident/analytics/privacy/cost-reporting packets are now verified. P10/P11 are locally verified; R2 reviewed the completed system and remaining live provider/privacy/release conditions at the owner-confirmed Astra Extra High setting. P12 local implementation is complete. The owner reported Astra Extra High for subsequent critical work; retain that setting for the G5/P13 dossier review when required. Cost snapshots and reported work do not prove actual provider charges or complete all P9 legal/release obligations. H2 is a conditional stage for routine interface work once contracts are stable, not a required detour. The completed R2 review does not close G5. Request a further Astra handoff if P12 reveals a critical architecture decision or the final recovery/security dossier needs review.

## P13/G5 handoff (2026-10-07)

P12 is preserved and the P13/G5 development packet is implemented and locally verified. Read [current evidence](docs/evidence/G5-P13.md), [BUILD-STATUS](docs/BUILD-STATUS.md), [deployment profiles](docs/DEPLOYMENT-PROFILES.md) and [pilot runbook](docs/PILOT-RUNBOOK.md). PostgreSQL stays active, migration stays off, fictional accounts are not real pilot participants, and production G5 remains conditional.

The latest explicitly reported selector is **6 Astra Extra High**. Continue at that setting for source-bound security/recovery review; no model switch is necessary while it remains selected. Sol 6.1 Extra High remains appropriate for later sensitive implementation and Sol 6.1 High for routine stable interface/documentation work. Do not invent a selector change or repeatedly interrupt already authorized work for an advisory recommendation.

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
