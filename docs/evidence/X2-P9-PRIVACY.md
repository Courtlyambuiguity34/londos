# X2 / P9 local privacy governance evidence

Recorded 2026-10-06, Africa/Kampala. Packet on `codex/londos-x2-2026-10-05`, following analytics commit `0970f28`. Owner-confirmed execution setting: **Sol 6.1 Extra High**. This packet implements P9.8's bounded local owner exports and governed eligible primary-data erasure. Live privacy/legal terms, complete subject-access/account erasure and physical backup restoration remain open gates. No main-database record was erased.

## Contract and measured scope

[ADR-0011](../ADR/0011-local-privacy-governance.md) defines the inventory, exclusions, provisional development retention and execution boundary. Fresh native merchant owners download eight allowlisted current business sections. Ordinary sections return at most 25 records per UUID cursor page; analytics returns one shop and at most 100 retained groups; every response has a 512 KiB budget. Exports exclude other members' identities, customer enquiry content, private investigation/evidence, credentials, job/notification payloads and raw receipts. Application profiles and incident messages are limited to the original actor's submissions within the merchant. They are bounded business exports, not a complete legal subject-access response or a consistent multi-page snapshot. Downloads are authenticated no-store responses; no server artifact or bearer URL is created.

Erasure defaults off and requires explicit `LONDOS_PRIVACY_ERASURE=true` in guarded loopback development database mode. Live erasure is disabled. The main runtime retains the default-off flag. Only disposable integration/browser databases enable effects against fictional data.

A separate privacy grant, native fresh MFA, current assignment and distinct case scope guard reviewer decisions. Active merchant members cannot review their own merchant. Requests and decisions require a reason, confirmation and matching version; private review reasons remain separate from owner explanations. Holds bind the exact merchant/kind/target and survive cancellation, denial or released assignment. Revoked-grant/scope assignments can be explicitly re-claimed; unassignment clears approval but retains holds/history.

The immutable development policy permits manual review after 30 days from enquiry closure or application rejection. Upgraded already-closed enquiries conservatively begin their retention clock at migration rather than inventing an old closure date. Public closure never erases content. Approved/referenced financial applications, accounts, trust/incident/contact history and financial/audit records remain retained.

Approved effects bind the exact target plan and native session for five minutes. The existing independent worker rechecks current owner and reviewer authority, native proof generation, scope, self-review exclusion, holds, age/state, plan hash, guarded database and live lease before atomic effects/history/audit/dedupe. SQL guards require the governed approved context for enquiry scrub, verification-byte deletion and permanent capture exclusion. A failed statement rolls back primary effects and completion; changed conditions return the case for fresh review without erasure.

Eligible closed enquiries lose only name/reply/message, retaining their minimal receipt and retry fingerprint. Rejected nonfinancial original-actor application evidence bytes are deleted while application/submission history remains. Analytics erasure deletes only that merchant/shop's aggregate groups and adds a permanent capture exclusion. Capture serializes with erasure, so a waiting capture cannot recreate groups. Canonical publication/audit/financial history remains.

## Verification

Final passing packet: **254 tests** — **23 unit**, **184 real PostgreSQL integration**, **16 fixture public browser** and **31 core production-browser tests**, with no skipped or expected-failure cases in the final runs. Lint, strict types, formatting, documentation links, standalone web/separate worker build and `npm audit --audit-level=high` passed (**zero vulnerabilities**). Configured-secret build scan passed over **1,498 files / nine candidate values** without printing values. Staged configured-secret scan passed across **53 files / nine candidate values**; applied migrations 001–014, dependencies/lockfile, private files and historical captures remain unchanged. Both secret checks cover exact configured values only, not every possible production secret.

Initial new-test fixture failures were diagnosed and corrected: the integration helper now acknowledges handled jobs through the real queue rather than violating the existing one-running-job-per-merchant constraint; browser assertions use exact headings, valid native origins, the normal MFA enrollment entry and deliberate resource-hiding status codes. No authorization check or database invariant was relaxed. The final enquiry case also redispatches the same currently leased job before acknowledgment to verify effect dedupe, then rejects the old acknowledged lease.

The real PostgreSQL suite passed **184 tests**, including **29 privacy cases** and all **155 prior integration cases**. Privacy coverage includes:

- Additive 014→015 and repeated migrations; unchanged legacy enquiry content; conservative closure clock and no implicit seed grant.
- Strict schemas, tenant-consistent target/hold references, fresh owner isolation, original-actor export exclusions and all eight allowlists; 28 catalogue records paginate 25/3 without omission.
- Concurrent idempotent requests, changed retry conflicts, separate native-MFA grant/scope, anti-self-review, competing claims, unassignment/reclaim and immutable review/hold history.
- Private-versus-owner explanations; active holds, manual release, too-young/open enquiries, approved and financially referenced applications, protected history denial and rent-closure preservation.
- One-way enquiry scrub and original intake retry without rehydration; verification bytes only; analytics capture opt-out without canonical/platform-history deletion; direct SQL effect guards.
- Wrong/stale leases, changed targets, expired approval, revoked owner/reviewer/scope and aged native MFA, including proven actual merchant/user lock waits.
- Actual source-table failure with atomic rollback and retry; late hold before worker effect; capture proven waiting behind erasure cannot recreate metrics.

The browser suite exercises real native owner sign-in/download/request and independent privacy-only native MFA enrollment, separate case claim, hold/redaction/release/approval, actual compiled worker completion and truthful primary-only result. Every one of the seven new protected methods has anonymous attack coverage; owner reads/writes/exports reject foreign owners. Private HTML/Flight, strict field/origin forgeries, unassigned case reads and unrelated operator grants are checked. Accessible desktop owner/reviewer and mobile keyboard/form/cancellation checks produce the inspected [owner](images/x2-p9-privacy-owner-desktop.png), [reviewer](images/x2-p9-privacy-review-desktop.png) and [mobile](images/x2-p9-privacy-mobile.png) captures. All records pictured are fictional.

## Preservation and runtime

[014→015 evidence](X2-P9-PRIVACY-MIGRATION.json) compares sorted whole-row digests over every original column in **42 existing tables**, preserving 1,506 shops / 150,004 products / 1,504 departments / one published revision, ordinary grants and three private configuration/account files. Repeated migration/seed passed. Local migration elapsed **68 ms**; this does not prove production downtime, backup restoration or capacity. Migrations 001–014 are unchanged; 015 is now applied and frozen.

[Runtime evidence](X2-P9-PRIVACY-RUNTIME.json) verifies matching schema-015 compiled web and separate worker, database/authentication/worker readiness, public shop/search responses and anonymous privacy API denials with private headers. Repeated explicit `db:privacy` adds only privacy to the verified fictional operator and preserves prior grants/private files. Native MFA and claimed scope remain required. The independent trust reviewer remains moderation-only. Main `localPrivacyErasure=false`, `liveErasure=false`; live analytics, collection and notifications remain disabled.

## Outstanding boundaries

Primary SQL erasure is irreversible and does not remove backups, WAL, environment snapshots, private notification copies, previous owner downloads or third-party copies. No physical-backup deletion or restore drill was performed. [Recovery instructions](../FAILURE-RECOVERY.md) require reapplying primary erasure/opt-out markers before restored data becomes available; production expiry, restore enforcement and legal hold obligations need separate approved policy and evidence. Retained immutable history has no general deletion endpoint. There is no native account deletion or full subject-access service.

P9.8 remains partial at the master-plan live legal/backup boundary. Continue **P9.9 measurable resource costs and remaining P9.7 cost views at Sol 6.1 Extra High**. Backlog age is not staff working time; absent provider/bandwidth/AI/collection sources must remain explicit. Partial P8 accounting/arrangement, wider LSS/public pagination, P10 and release gates remain open. R2 uses **6 Astra Extra High** when the completed system and release evidence reach that boundary.
