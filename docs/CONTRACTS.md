# Domain contracts for the next implementation stage

Status: initial state records and identity/permission/transaction contracts are backed by X1 code and corrected/verified in [R1](evidence/R1-REVIEW.md). X2 adds reviewed local catalogue/contact/request/private-media commands; see [ADR-0004](ADR/0004-catalogue-contact-and-private-media.md). X2 also implements the local LSS/publication, canonical PostgreSQL discovery and eligible ready-image paths; see [ADR-0005](ADR/0005-safe-design-and-canonical-public-reads.md). P8 implements local application/private-evidence review and development rent/provisioning under [ADR-0006](ADR/0006-local-applications-and-rent-lifecycle.md), plus local teams/addresses/scoped operations under [ADR-0007](ADR/0007-local-administration-and-shop-addresses.md). P9 implements local reporting/moderation/appeals and development verification under [ADR-0008](ADR/0008-local-reporting-and-trust-review.md), plus assigned incidents and authenticated-owner recovery under [ADR-0009](ADR/0009-local-incidents-and-owner-confirmed-recovery.md). Live financial/provider commands and production trust policies remain later work. See [ADR-0003](ADR/0003-identity-and-durable-jobs.md) and [X1-SECURITY](X1-SECURITY.md).

## State separation

| Record | States | Required rule |
|---|---|---|
| Application | draft, submitted, reviewing, needs_information, approved, rejected | Only authorized review advances approval; resubmission retains history. |
| Shop publication | provisioning, unpublished, active, temporarily_closed, archived | Immutable shop identity is independent of slug and internal mall placement. |
| Tenancy | pending, active, due, grace, closed | Verified obligations/events drive state; development timers follow the selected immutable policy; live timing remains unapproved. |
| Moderation | clear, under_review, suspended | Renewal cannot lift suspension. Only an authorized moderation decision can. |
| Shop operations | running, paused | Resume removes only the operational hold; it never changes rent, publication or moderation. |
| Trust case | open, reviewing, suspended, dismissed, reinstated | Reports never auto-hide; versioned decisions aggregate strongest case restriction plus immutable legacy baseline. |
| Trust appeal | pending, resolved | Fresh owner may appeal a restriction; an independent scoped reviewer clears it without erasing events. |
| Incident | open, investigating, escalated, resolved, cancelled | Original report/target identity is immutable; exclusive kind-authorized assignment/scope guards private investigation; escalation releases both. |
| Contact restoration approval | absent, current, expired/invalidated | Original active owner, fresh auth, exact historical target and current case/contact versions; 30-minute expiry and credential-generation binding. |
| Media | uploaded, validating, processing, ready, rejected, failed, deleted | Quarantined/raw assets are not public ready media. |

Public eligibility must combine current publication, tenancy, moderation, absence of an operational hold and resource visibility. The fixture preview's open/closed/suspended flags are demonstration data, not the implemented policy engine. The local shared eligibility rule permits active/due/grace tenancy only with active publication, clear moderation and no hold; rendered shops/search require a published design. Old-slug/immutable-ID resolution uses the same eligibility before any redirect. Live grace/notice/rent/retention policies still require owner approval.

## Permission matrix and implementation boundary

This matrix includes planned capabilities. X1/R1 implement profile/membership/invitation/ownership and job metadata/replay. X2 adds catalogue, contact/request and private media commands, scoped operator support reads and incident-mediated exact historical contact restoration. Design/preview/publish commands now use separate grants, immutable scoped revisions and fresh publication authentication. P8 adds owner applications/private evidence and separately scoped review/finance commands with native MFA, fresh authority and anti-self-review rules. Local owner teams/addresses, scoped operations, reporting/moderation/appeals and pilot analytics are now implemented. Local governed privacy and resource/reporting costs are implemented below. Lost-all-factor/email/ownership adjudication, full live legal/backups/subject-access and live reports/verification remain later work. Each new action needs its own grant, scope and attack tests.

| Action | Merchant owner | Staff | Operator |
|---|---|---|---|
| Read/edit catalogue and ordinary profile | Own shops | Explicit own-shop grant | Explicit scoped support permission |
| Draft/preview/publish design | Own shops; publication also needs fresh authentication | Separate membership/shop design and publish grants | No design command access is implemented; future support requires its own scoped contract |
| Change contact/payment details | Own shops plus step-up | Separate sensitive grant plus step-up | No direct contact update; recovery-kind assigned incident, native fresh MFA and original owner’s exact unexpired historical confirmation only |
| View rent and payment records | Own shops | Separate finance grant | Finance/reconciliation permission |
| Change membership/ownership | Owner plus step-up and last-owner rules | No implicit permission | No incident command; future identity/ownership adjudication requires its own approved proof policy |
| Change shop address | Owner plus step-up, version, reason and confirmation | No | No implicit operations/support authority |
| Move mall or pause/resume | No | No | Operations permission, separate shop scope, native fresh MFA, version, reason, confirmation; no self-administration |
| Approve/provision/suspend/reinstate | No | No | Specific operator permission, MFA, reason and audit |
| Read private application evidence | Own application, fresh authority | No | Separate application-review permission/claim and fresh MFA |
| Read report/image/notes and decide | No | No | Moderation permission, distinct case scope, native fresh MFA and no merchant self-membership |
| Read redacted trust decisions / appeal | Own shop, fresh owner authority | No | No implicit owner access; separate case authority for review |
| Open/read/cancel incident | Own shop, fresh owner authority | No | Kind-specific grant, native fresh MFA and separate incident assignment/scope for private reads/commands |
| Confirm exact historic contact restoration | Original reporting active owner, fresh auth, current case/contact versions and reason | No | Cannot supply owner approval or replacement fields |
| Contain reporting owner sessions | No direct incident command | No | Recovery-kind assigned incident, native fresh MFA, reason/confirmation/version; once per case; no password/factor/email/membership changes |
| Read shop pilot aggregates | Current fresh owner only; recheck after merchant lock | No | No support/scope fallback |
| Read platform pilot summaries | No implicit permission | No | Separate global analytics grant and native fresh MFA; recheck after queries; no private workflow decisions/record viewer |

Every server read/action validates actor, permission and actual resource ownership. The browser does not supply trusted roles. Operator access is separated from ordinary merchant membership. With core services disabled, demo portal pages show no private data/actions. With explicit local core configuration, protected profiles/security/operator job views enforce these policies. Staff additionally require a per-shop grant; operator support requires a shop scope; P8 review/finance requires a distinct claimed application scope, also before a shop exists.

Operator job metadata/replay uses a separate explicit global job permission and fresh MFA for replay; it does not expose job payloads. That permission does not grant merchant support access.

## Revocation and invitation contracts

MFA proof requires the current session, factor identity and credential generation. Password changes/reset revoke preceding sessions and pending challenges atomically; factor removal does likewise. Requests verifying old credentials across a reset cannot establish fresh authority. Migration 007 clears old proofs, preserving users and sessions but requiring another MFA challenge where enrolled.

An active owner may issue a bounded, email-bound, expiring one-use invitation. Removal, demotion or ownership transfer that ends that issuer's active-owner authority revokes their unaccepted invitations in the same transaction; restoring the role cannot revive them. Accepted memberships remain independent. Acceptance rechecks the recipient's session and step-up after acquiring the merchant lock, comparing expiry with current wall-clock time.

Mutations recheck authority after serialization waits. Revocation before that final check denies the action; already-authorized commands are not promised retroactive cancellation. Preserve this boundary explicitly when implementing each new command.

## Persistence and side effects

Canonical mutations require a database transaction, tenant-consistent references, conflict checks where relevant, and durable audit/event registration. Outbox/transactional queue processing must survive crashes and tolerate duplicate/out-of-order delivery. Prices use exact integer minor units; the SQL domain rejects fractional/nonfinite/out-of-range inputs rather than rounding them. Rent corrections create new events rather than overwrite history.

## Local administrative contract

Owner team reads are bounded/private; new team commands compare a merchant revision after locking. Legacy membership commands and invitation acceptance also advance that revision, so they invalidate stale UI commands. Tokens are excluded from team metadata and entered only privately; issuer-revocation and last-owner constraints still apply.

Every current and former slug is permanently reserved to its immutable shop through append-only `shop_addresses`; tenant-consistent registration triggers cover direct SQL and future provisioning. Sensitive owner commands version-check changes. Ineligible shops never disclose aliases through public redirects.

The explicit operations grant permits minimal queues/aggregate occupancy; private details and commands additionally require `operator_operations_scopes`. It is distinct from support scopes and application review/finance claims. Active merchant self-membership denies administration. Claim/actions recheck current authority after merchant-lock waits. Mall moves also use the provisioning capacity lock and reject a full target. Pause/resume changes only `shop_operations` plus shop version and audit; it cannot rewrite financial history, publish, extend grace or lift moderation. Finance exceptions require separately claimed application-finance scope. See ADR-0007 and [administration tests](evidence/X2-P8-ADMIN.md).

## Development rent contract

The owner selected UGX 5,000 per 30 days, seven days’ grace and manual operator reconciliation, with live collection disabled. Immutable policy versions bind approved applications/invoices/contracts. Approval creates an obligation before a shop; only a scoped finance operator with fresh MFA can record a verified payment/waiver against its exact reference. Amounts are exact integer minor units. Partial credits cannot provision, overpayment/reference/currency mismatches have no effect, and a unique receipt cannot credit two invoices.

Full first settlement finalizes coverage once and atomically provisions an unpublished shop and tenancy. Stable per-actor command keys and merchant serialization make repeated/concurrent attempts idempotent. Reversals append linked equal negative corrections; they never edit the original event or alter finalized dates. SQL workflow guards reject invalid/overpaid/negative payment events in addition to service checks. Current authority is checked again after locks, before applying even an idempotent retry.

Only P8 contracts enter scheduling. Current worker time and canonical coverage/credits drive reminders, due/grace/closed transitions and reopening; stale payloads carry no paid-through authority. Renewal/correction cannot publish drafts or lift moderation. Fixed-day development policy, bounded private image evidence and operational limits are detailed in ADR-0006. Production policy/provider callbacks remain separate work.

## Local reporting and trust review contract

[ADR-0008](ADR/0008-local-reporting-and-trust-review.md) defines the P9 local boundary. Anonymous intake uses exact origin, bounded JSON, atomic budgets, retry keys and a hashed private attachment capability. It returns a generic receipt for known/unknown shop IDs without private target metadata. Reports do not automatically hide shops. One bounded normalized image can be uploaded before claim within 30 minutes; it is immutable and readable only by a scoped reviewer with fresh native MFA.

The `moderation` permission requires a distinct claimed `operator_trust_scopes` case. It grants no application evidence, finance, recovery or operations authority. Cases keep private report/notes separate from merchant-facing decision reasons. Current authorization is rechecked after merchant-lock waits. Decisions compare case and canonical moderation versions and commit state, append-only history/audit and private owner notice jobs atomically.

Each case contributes its own restriction. Strongest restriction wins together with an immutable captured legacy baseline; clearing one case cannot lift another. External moderation changes conflicting with computed state fail closed. Fresh owners receive redacted own-shop decisions and may submit a versioned appeal; a different reviewer must clear the last reviewer’s restriction. Restoration changes no rent, publication or operational hold. Guest enquiry intake uses the shared canonical eligibility rule.

Public verification is derived only from an approved P8 application, its provisioned shop and private reviewed evidence. The displayed claim is “Development application reviewed”, with explicit fictional/local limits and no identity/product/payment guarantee. It exposes no application fields or evidence and cannot be supplied by merchant LSS/profile content. Production verification/moderation/retention policies remain separate gates.

## Local incident and recovery contract

Owner intake derives the reporter from authenticated authority and uses a strict bounded schema, stable UUID retry key and fingerprint. Only contact-change cases bind an exact earlier tenant-consistent contact snapshot; other kinds cannot supply contact revision fields. Immutable history begins at the current upgrade baseline and appends every later version; absent earlier data is not reconstructed. Same-version rewrites cannot alter snapshots.

Minimal queues require native MFA and filter each kind's current explicit grant: recovery for security/account/contact, moderation for fraud, finance for payment exceptions, review for verification and support for support. A fresh reasoned claim compares the case version, rejects merchant self-membership and assigns one reviewer plus `operator_incident_scopes`. Private reads/commands require fresh native MFA, current assignment and that distinct scope. Other grants/scopes cannot substitute. Escalation deletes assignment/scopes; a qualified reviewer must claim again. Notes are private; consequential actions separately require owner-facing explanations. Resolution/cancellation never deletes history or changes unrelated canonical state.

Containment targets only the reporting still-active owner of an eligible recovery-kind case, once per incident. Reporter-user and merchant locks serialize native credential-generation revocation, session/proof/challenge removal, reset-token invalidation, approval clearing, event/audit and minimal local notification. It does not change passwords, MFA, email, memberships or block later native sign-in. Old authentication completion is fenced by existing generation checks; the final-check revocation boundary still applies to already-authorized work.

The original reporting owner separately confirms the exact immutable target with fresh authority, current case/contact versions and a reason. Approval expires after 30 minutes and binds current native credential generation. Assigned recovery restoration locks the merchant/reporter user, rechecks reviewer authority and owner membership/generation/contact version, validates the snapshot against current contact schema, and appends a new version with audit/notices. No operator-supplied contact fields or owner approval are accepted. Ordinary support and legacy recovery/shop scopes receive denial from direct contact updates. Native password reset/change and existing MFA recovery codes remain the authentication mechanisms; lost-all-factor/email/ownership recovery requires a separate approved policy.

Owner HTML/Flight and APIs expose redacted investigation events without reviewer identity/private notes. Public rendering, queue metadata and notification payloads contain no report, old contact fields, credential values or investigation reasons. Kind-specific incident triage grants no trust, finance, application, operations or membership decision authority. [Incident evidence](evidence/X2-P9-INCIDENTS.md) records isolation, lock races, native containment and exact restoration.

## Interface progress

- Implemented: current actor/session/action/shop permission resolver with explicit denial.
- Implemented: scoped private profile/membership/invitation services and tenant-consistent database constraints. Extend to every new resource.
- Implemented: shared canonical public eligibility; dynamic no-store shop/search/media responses; generated indexed search vectors update transactionally. No public asynchronous projection/shared CDN cache is used.
- Implemented: transactional queue, version-aware internal profile projection, idempotency/lease/effect receipts, scheduler and local notification/storage interfaces. New consequential handlers require their own tests.
- Implemented: closed LSS schema 1 and prototype registry, owned references, immutable drafts, manual patches, private previews, version-checked publication and restoration as a new draft.
- Provider adapters for storage, notification, payment and AI; fakes labeled separately from verified live capability.

R1, the local X2/P5–P7 prototype, [P8 local lifecycle](evidence/X2-P8.md), [administration](evidence/X2-P8-ADMIN.md), [local P9 trust](evidence/X2-P9.md), [local incidents/recovery](evidence/X2-P9-INCIDENTS.md) and [local analytics](evidence/X2-P9-ANALYTICS.md) are verified. Continue **Sol 6.1 Extra High with P10 provider-neutral AI contracts**, extending each command’s grant/scope/policy contract before implementation. Final system/release review remains **6 Astra Extra High R2**.

## Local pilot analytics contract

[ADR-0010](ADR/0010-local-pilot-analytics.md) separates nine browser observations from two audit-derived canonical merchant events. Only an explicit valid fictional loopback/database capture flag enables strict signed 30-minute rendered contexts. Extra fields/forged merchant events fail; page/action/target/channel and current public eligibility are verified. Receipt plus budgets plus daily increment commit atomically. Generic accepted receipts reveal no target/storage outcome. A bounded separate pool and lossy asynchronous requests keep analytics failures out of browsing and canonical writes.

Metrics contain only day, optional tenant-consistent canonical scope, event, observed source, bounded result/contact detail and count. Receipts are hashed expiring context/action identities, never visitor IDs. No sensitive raw query/hash, URL/referrer, IP, user agent, account/contact/evidence/credential value is retained. Bounded tab storage observes direct/discovery/unattributed navigation; blocked storage is unattributed. Counts are not unique people/sales. Publish/catalogue counts join committed audit resources with merchant consistency, without inventing historical browser data or coupling analytics to financial/business decisions.

Owner aggregate authority is current and fresh after merchant serialization. Explicit global analytics operators require native fresh MFA before and after bounded queries; the grant does not grant other workflow scopes. Cohort durations exclude unmeasured applications; renewal totals distinguish net payments from waivers and deduct linked reversals. Backlog counts/age expose no private case records and do not measure staff working time. Configurable 7–90 UTC-day retention (default 30) immediately bounds reads; existing fenced maintenance deletes bounded expired rows. Invalid policy cannot purge aggregate history. Canonical audits/financial history remain preserved. Local governed primary/export workflows follow below; live legal/backups/full subject-access remain open; local resource reporting follows below.

## Local governed privacy contract

[ADR-0011](ADR/0011-local-privacy-governance.md) defines bounded original-actor/merchant exports, immutable request retries and limited primary erasure. Eight allowlisted sections, 25 UUID-cursor rows (analytics one shop/100 groups), 512 KiB, final fresh owner recheck and metadata-only export audit exclude secrets/customer content/private third-party investigation. Exports do not use durable artifacts or bearer URLs and are not complete account/subject-access responses.

| Action | Required current authority | Result boundary |
|---|---|---|
| Inventory/export/request/cancel | Native fresh current merchant owner; request subject/tenant constraints | Own bounded requests and safe explanations; no private review/hold notes |
| Minimal queue/claim | Explicit privacy grant, native fresh MFA, no merchant self-membership | Claim current version into distinct exclusive privacy assignment/scope |
| Private case/hold/release/deny/unassign | Above plus matching current assignment and privacy case scope | Reason/confirmation/version; immutable history; unassignment preserves holds |
| Approve | Above plus explicit guarded local erasure flag and eligible exact plan | Five-minute native-session-bound approval; minimal durable job, no completion claim |
| Worker primary effect | Current lease, requester ownership, approval session/proof/grant/scope/assignment, unchanged plan, no holds, policy/age and guarded development database | Atomic SQL effect, completion/audit/dedupe; changed/revoked conditions apply no effect |

Eligible mature closed enquiries retain only minimal closed receipt/retry identity after one-way content scrub; rejected nonfinancial applications lose private evidence bytes, preserving required canonical history; shop analytics erasure adds immutable capture exclusion and deletes only shop aggregates. Merchant serialization prevents waiting capture from resurrecting them. SQL effect guards require the current governed approval context. Immutable legal/financial/account/investigation/contact/audit history remains protected. Primary completion is distinct from backup/notification/download/external-copy erasure. Live policy/backup/full subject-access remain gates; rent closure never deletes data. [Evidence](evidence/X2-P9-PRIVACY.md) tests these boundaries using disposable fictional databases.


## Local resource snapshots and reported operating costs

[ADR-0012](ADR/0012-local-resource-cost-reporting.md) and [cost evidence](evidence/X2-P9-COSTS.md) define development-only measured snapshots and a separate immutable reported-work journal.

| Action | Required current authority | Result boundary |
|---|---|---|
| Own shop aggregates | Native fresh current owner; merchant/user locks and final recheck | Logical media bytes, recorded quota/headroom, current shop queue and reported totals; no private reasons/identities/evidence volume |
| Platform aggregates/selection | Explicit costs grant/native fresh MFA before and after queries | Coarse measured volumes, separate shared job scopes, reported totals and 20 minimal shop rows; no payload/content viewer |
| Shop scope claim | Above, no active merchant self-membership, current shop version, reason/confirmation | Distinct costs scope, one private audit; no business-version mutation |
| Private journal/read/write | Above plus matching costs shop/merchant scope; recheck after locks | At most 20 immutable entries per UUID page; strict reasoned/versioned original or exact correction |

Logical SQL blob lengths exclude physical storage overhead, WAL/backups, fixtures/external files and replication. Missing quota is unavailable; reserved quota is headroom. Current attempts can reset on authorized replay and are not lifetime executions, CPU or elapsed time. Pre-shop evidence and shared jobs are not assigned to shops by estimates. Bandwidth, AI/provider billing, price rates and independently measured staff time are explicitly unavailable.

Reported support/verification/rent-collection work records separate integer minutes and UGX expense minor units, not merchant charges. Strict 90-day UTC input dates, 7/30/90-day summaries, 100-original UTC daily limit and two-second statements bound operation; exact corrections remain available after the original-entry limit. Retry fingerprint/key and separate journal version serialize effects. One immutable linked exact negative correction preserves original category/day/currency/tenant and history; final owner/grant/MFA/scope checks and SQL constraints reject revoked/changed authority and malformed corrections. Entry/version/audit are atomic; no finance, publication, moderation, operations, privacy holds or queue behavior changes. Net zero is only a reported sum with unknown coverage, and absent records mean unmeasured. Production retention/prices/provider accounting remain separate gates.
