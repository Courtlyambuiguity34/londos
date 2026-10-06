# R2 system security and release-evidence review

Reviewed on **2026-10-06** at owner-confirmed **6 Astra Extra High**. Baseline: `79e9fe5b3dbea69dee7461038b7c9f31442de462`, branch `codex/londos-x2-2026-10-05`. The model setting is the owner's report; the assistant cannot inspect or change the selector.

## Outcome

R2 fixes six reproduced defects in the implemented local application. **390 unique tests pass: 69 unit, 260 PostgreSQL integration, 16 fixture browsers and 45 core HTTP/browser cases.** The existing P11 local G4 acceptance remains conditional; **G5 and production deployment are not accepted**. This is a source/behavior/evidence review with real PostgreSQL and compiled HTTP/browser checks, not independent penetration testing or production certification. Applied migrations 001–018, dependencies, canonical data and historical P10/P11 evidence are preserved.

## Findings and regressions

Severity reflects the implemented development boundary and the authority/timing needed to reproduce the issue.

| ID / severity | Reproduction before the fix | Change and evidence |
|---|---|---|
| R2-01 **Medium**, request resource handling | An unfinished JSON stream remained pending indefinitely; cancellation and reader cleanup were inconsistent. JSON MIME comparison rejected valid mixed case and accepted a lookalike prefix. Upload cancellation surfaced as an unclassified error. | JSON uses the shared byte-bounded reader with a 15-second deadline, request cancellation, cleanup and explicit 408 errors. Exact normalized JSON MIME is required. Eight unit cases cover JSON/upload stalls, disconnects, split UTF-8, byte overflow, malformed data/MIME and pre-aborted input. A compiled HTTP test leaves a chunked authentication body unfinished and expects 408 at the real deadline while readiness remains healthy. |
| R2-02 **Medium**, stale replay authority | Hold a dead job's row lock; start replay with native fresh MFA; revoke the jobs grant, delete the session, or expire its MFA proof before releasing the lock. All three variants originally reset the job and appended audit. | Recheck current native authority after acquiring the job row. All three denial cases preserve dead state/attempts and create no replay audit; a positive native-MFA case still replays exactly once. |
| R2-03 **Medium**, valid catalogue choices hidden | Put 32 nonarchived products in an archived department ahead of an eligible product. Manual design and the authorized minimal AI context originally selected the first 32 before excluding archived departments, returning no eligible product. | Join current owned unarchived departments before the ordered first-32 limit in both selectors. Two real-database cases prove the active product is available. Bounds, existing references and public publication rules are unchanged. The AI test uses a labelled fixture transport, never a live provider. |
| R2-04 **Medium**, finance scope outlived provisioning wait | Hold the shared mall-capacity lock, start an approved invoice settlement, observe the database wait, revoke application-finance scope, then release. Baseline still credited and provisioned a shop. | Final finance scope/native fresh authority checks run inside the same transaction. Regression denies with 404 and leaves no credit, rent event, command receipt or provisioned shop. |
| R2-05 **Medium**, operations authority outlived mall wait | Hold the target mall row, start a scoped move, revoke the operations grant while it waits, then release. Baseline still moved the shop. | Recheck operations authority before commit. Regression denies with 403 and preserves mall, shop version and audit count. |
| R2-06 **Medium**, moderation scope outlived secondary lock | Hold the shop moderation row, start a claimed case suspension, revoke its trust scope during the observed wait, then release. Baseline still suspended the shop and wrote history. | Recheck trust authority before committing the decision/history/audit/outbox transaction. Regression denies with 404 and preserves case/moderation versions, state and decision history. |

The concurrency regressions observe actual `pg_stat_activity` lock waits before revoking authority. They do not replace the authentication library or use a client-supplied actor in HTTP. Native test clients have distinct fictional trusted adapter addresses to avoid sharing one library MFA-attempt bucket; the production HTTP adapter continues to overwrite untrusted IP headers. Authority lost before the final check denies and rolls back the command. Revocation after that check is not promised retroactive cancellation.

Reproductions: [body unit cases](../../tests/unit/r2.test.ts), [replay/catalogue PostgreSQL cases](../../tests/integration/r2.test.ts), [finance/operations cases](../../tests/integration/p8.test.ts), [moderation case](../../tests/integration/p9.test.ts), [compiled HTTP case](../../tests/e2e-core/security.spec.ts). Initial fixture mistakes (missing department position, a shop-object/id mismatch and shared test-client MFA rate bucket) were corrected before recording the failing behavioral baselines. No production defense, rate limit or assertion was disabled to obtain a pass.

## Review coverage and limits

| Boundary reviewed | Evidence assessed and current result |
|---|---|
| Identity, native MFA/recovery, private APIs/HTML/Flight, origin and budgets | Current auth hooks/adapter, permissions/session wall-clock checks, private response headers and the existing tenant-attack registry. Original R1 regressions retained; new body/replay regressions above. Production trusted ingress, distributed edge budgets and lost-all-factor adjudication remain separate. |
| Transactions, finance, operations, trust and incident recovery | Immutable history, claims/scopes, native actor checks, merchant/user/shared capacity locks, containment and exact owner-approved contact restoration. Three secondary-lock defects fixed above. Richer accounting/arrangements and live collection are not inferred from the development workflow. |
| Media, public eligibility, LSS and pagination | Owned normalized private media, quota/process fences, strict safe registry, canonical current eligibility, no-store reads, generation-bound keysets and bounded manual/AI references. The private selector defect is fixed. Remote storage/CDN invalidation and actual handset/screen-reader tasks remain external. |
| Privacy, analytics and cost reports | Current approval/worker fences, permanent erasure exclusions, safe limited export, no raw query analytics and immutable reported-cost corrections. These do not implement complete legal subject access, account deletion or physical backup expiry. |
| AI admission, transports and apply/publication | Fixed HTTPS endpoints, normal proxy/CA, bounded closed output, consent, durable budgets/cooldowns, current authority/context after waits, scrubbed metadata, versioned private draft apply and separate publication. Fixture tests prove local contracts; no active provider credentials exist for live account/quality/billing verification. |
| Jobs, schema, recovery and artifacts | Existing lease/crash/deduplication regressions and P11 old-job/LSS/017→018/clean-install evidence reviewed. R2 changes neither job payloads nor SQL schema. Prior two-replica scale and separate outage/recovery results retain their original scope; they are not rerun or presented as physical disaster recovery. |

## Verification

Final command outcomes, exact source/artifact identities, counts and redacted execution-log digests are recorded in [R2 verification](R2-VERIFICATION.json). [Matching runtime](R2-RUNTIME.json) records restored schema-018 compiled web/worker readiness and canonical counts. [Provider observations](R2-PROVIDERS.json) separate real environment state, official published prices and unavailable live tests. The follow-up [commit manifest](R2-COMMIT.json) identifies the tested implementation commit without a self-referential hash.

Required checks are `npm run check`, `npm run format:check`, `npm run test:integration`, `npm run build`, `npm run check:bundle-secrets`, both production browser suites, `npm audit --json`, documentation/whitespace checks and configured-value staged/log scanning. Browser runs use system Chromium. Private configurations, accounts, traces and raw task logs remain ignored. Configured-value scanning is not a general repository/production scanner certification.

R2 needs no migration, backfill, seed or dependency installation. Original schema checksums and historical evidence are compared with the starting commit. P11's clean install, logical upgrade and load experiments remain valid historical evidence for their tested commit; this security patch is not a new throughput benchmark. Reverting the code to P11 would restore the six fixed defects; prefer a reviewed forward fix. A production rollback/restore rehearsal is still P12 work.

## Provider configuration

All 12 intended nonsecret values are injected into the current process. Secure Gemini/OpenAI bindings are absent both from the current process and saved requirements; required-live verification reports `credentials_unavailable`, exit 1 and zero live requests. This does not establish that any supplied key is invalid. Remote AI remains off.

Official pricing endpoints are now reachable through normal HTTPS/proxy trust. `gemini-2.5-flash` standard text input/output including thinking is USD 0.30/2.50 per million, matching 300000/2500000 micro-USD settings. Current `gpt-5-mini` has published standard rates USD 0.25/2.00; the saved 750000/4500000 settings instead match **`gpt-5.4-mini`**, whose published Responses/structured-output contract supports this adapter. Recommend changing the saved OpenAI model to `gpt-5.4-mini`, retaining those rates, then running bounded live checks. A draft suggestion cannot overwrite an existing saved value or prove account access. See [provider setup](../AI-ENVIRONMENT.md) for the exact activation steps and pricing scope.

## Remaining conditions and owners

| Condition | Owner and next evidence required |
|---|---|
| Active keys, selected model/rates, quality, data terms and actual charges | Owner binds genuine secure provider credentials and saves the model correction; engineering runs bounded live contracts and representative consented quality checks. Keep remote AI off until verified; estimates are not bills. |
| P11.6 actual low-end handset, Ugandan network and screen-reader tasks | Owner/pilot participants and accessibility reviewer run real user tasks; automated axe/keyboard/emulation is retained evidence only. |
| P9.8 legal retention, full subject-access/account deletion, lost-factor proof and production trust policy | Owner/legal reviewer approves policy; engineering completes missing workflows before affected live use. Physical copies need backup expiry and erasure-aware restore evidence. |
| Partial P8 richer accounting/mismatch investigation, arrangements and history navigation | Owner defines affected business policy; engineering implements and tests it before representing those capabilities as complete. Development policy remains UGX 5,000/30 days, seven-day grace/manual reconciliation; live collection disabled. |
| Production hosting, ingress/TLS/CDN/storage, roles, secret scanning, notifications and supervision | Owner chooses accounts/domain/budget; engineering prepares and verifies a P12 release candidate with independent web/worker lifecycle and least privilege. No production endpoint has been deployed. |
| T25 encrypted physical restore, media recovery, approved RPO/RTO and rollback rehearsal | Owner/operator defines recovery targets and key custody; engineering performs isolated P12 restore/replay/forward-fix drills and measures actual recovery. The observed cloud reconnect and logical upgrade do not close this gate. |

These conditions are launch blockers or unimplemented scope, not silently accepted production risks. No confirmed critical/high application defect was found in this review, but the external conditions prevent a production-security or G5 approval.

## Handoff

R2 uses the owner's confirmed Astra Extra High setting; do not ask for that confirmation again. **Next implementation setting: Sol 6.1 Extra High for P12 release preparation.** Remind the owner and wait for their reported switch before that model-dependent stage. Astra Extra High remains appropriate for the final G5 recovery/security dossier review if needed. The assistant does not change model settings automatically.

Continue on the authorized branch with all completed P10/P11/R2 work preserved. P12 prepares concrete reviewable artifacts and rehearsals; deployment needs separate owner authorization. Cloud draft persistence could not be confirmed: full, repository-only and startup-only requests returned `INVALID_ARGUMENT`, and readback retained the P11 pin/startup. [Proposed startup instructions](../CLOUD-STARTUP.md) and [configuration evidence](R2-CLOUD-CONFIG.json) preserve the concrete configuration for later review. Use the current pushed branch HEAD before saving a future pin; a successful draft save still requires publication to activate it. This documentation-only follow-up leaves the tested implementation and historical verification identities intact.
