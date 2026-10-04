# Model and execution recommendations

The owner requested explicit model handoffs on 2026-10-04. Follow these stages when executing [the implementation plan](docs/IMPLEMENTATION-PLAN.md). The model choices are a workflow recommendation, not a measured comparison on this repository.

**Current handoff (2026-10-05, Africa/Kampala):** H and X1 secure foundation work are complete and locally verified. Next: **6 Astra Extra High R1**. Confirm that setting and say **“Continue R1.”** See BUILD-STATUS and X1 evidence before continuing.

## Model settings

| Stage | Model / reasoning | Work |
|---|---|---|
| H: foundation and ordinary interface work | Sol 6.1 / High | Reconcile the explicit stack instruction; project setup, public interface with labeled fixtures, reusable accessible components, routine tests, CI, diagrams and setup documentation. |
| X1: secure infrastructure | Sol 6.1 / Extra High | P2–P4: PostgreSQL schema/migrations, identity, MFA, permissions, tenant isolation, durable jobs and transactions. |
| R1: review the security boundary | 6 Astra / Extra High | Review state/permission/data contracts and X1 security evidence before private features depend on them. |
| H2: ordinary feature implementation | Sol 6.1 / High | Routine pages, forms and component work using reviewed domain interfaces. Ask for a setting change when the next task crosses into an Extra High boundary. |
| X2: sensitive feature implementation | Sol 6.1 / Extra High | LSS/reference safety and publication concurrency; media security; rent/provisioning/reconciliation; cache eligibility; sensitive changes; AI context and orchestration boundaries. |
| R2: final critical review | 6 Astra / Extra High | Full-system security, migration/rollback, recovery and release evidence; difficult unresolved architecture problems. |

Model settings do not replace tests, acceptance gates, review or recovery. Use High for routine work and Extra High at the listed boundaries; Max/Ultra is not the default.

## Handoff and reminder procedure

1. Read [BUILD-STATUS](docs/BUILD-STATUS.md) at the start of each turn. It is the persistent record of completed work, evidence and the next model setting.
2. Complete the currently authorized stage, run its meaningful checks, and save an honest progress report.
3. At a model boundary, update BUILD-STATUS and end the response with an explicit reminder. For example: **“Sol 6.1 High work is complete. Please switch to Sol 6.1 Extra High and say ‘Continue X1.’”**
4. Wait for the owner to state that the setting has changed before executing the dependent stage. Do not infer that a model or reasoning level changed from elapsed time.
5. The assistant cannot operate the owner's model selector or verify its UI setting. Record the setting the owner reports; do not pretend to have switched it programmatically.
6. Recheck repository state and the latest evidence after resuming. Continue the existing branch/checkout and preserve completed work.
7. Give the same explicit handoff for required Astra reviews. The owner controls those model changes; no automatic background reminder or autonomous model switching is promised.

## Scope of the first High stage

Stage H establishes the executable web foundation and demonstrates the anonymous discovery/department/product journey with visibly fictional fixtures. It does not claim to complete PostgreSQL, authentication/MFA, private workspaces, rent, tenant-isolation guarantees, LSS publication, uploads or live AI providers. Those remain in the plan and are implemented under the later settings.

An owner instruction to build the application authorizes development and local validation. Production deployment still follows the explicit authorization requirement in [prompt.txt](prompt.txt).
