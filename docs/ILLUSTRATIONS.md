# Londos system and journey illustrations

These diagrams describe the intended application and the implemented preview separately. The SVG artwork under `public/illustrations` is platform-owned fictional demonstration art; it is not merchant-uploaded content or photography.

## Intended application boundaries

```mermaid
flowchart TB
  Customer[Anonymous customer] --> Public[Mall and Shop server-rendered routes]
  Merchant[Merchant session] --> Shopkeeper[Shopkeeper]
  Operator[Operator session with MFA] --> Landlord[Landlord]
  Public --> Read[Public eligibility and scoped reads]
  Shopkeeper --> Policy[Identity, permission and tenant policies]
  Landlord --> Policy
  Policy --> Domain[Domain services and transactions]
  Read --> DB[(Canonical PostgreSQL)]
  Domain --> DB
  Domain --> Outbox[Durable event or transactional queue]
  Outbox --> Worker[Independent Node worker]
  Worker --> Search[Public search projection]
  Worker --> Storage[Validated media and responsive variants]
  Worker --> Notify[Notifications and reminders]
  Shopkeeper --> Designer[Authorized design context]
  Designer --> AI[Optional provider-neutral AI]
  AI --> Validate[Deterministic LSS validator]
  Validate --> Preview[Private preview]
  Preview --> Confirm[Merchant confirms publication]
  Confirm --> Domain
```

X1 implements local PostgreSQL, the initial session/MFA/permission boundary and the durable worker. X2 adds catalogue/contact commands, guest requests and private worker media processing. P6/P7 adds safe LSS/publication, canonical PostgreSQL search and eligible public image delivery. P8 adds local applications/review, development rent/provisioning, scheduled tenancy, owner teams/addresses and scoped shop operations. P9 adds local reporting/moderation/appeals, truthful development verification, assigned incidents/owner-confirmed recovery and privacy-minimized analytics. P9 adds governed local privacy/cost reporting; P10 adds the private deterministic/provider-contract assistant and P11 completes the bounded semantic registry. Live providers and production operational integrations remain separate gates. The complete diagram is the intended system, not a claim that every component is ready.

## Implemented X1 identity and mutation boundary

```mermaid
flowchart TD
  Login[Password and verified email] --> Challenge{MFA enrolled?}
  Challenge -->|Yes| Factor[TOTP or unused recovery code]
  Factor --> Proof[Proof bound to session, factor and credential generation]
  Challenge -->|No| Session[Password session]
  Proof --> Policy[Current session and explicit action permission]
  Session --> Policy
  Policy --> Tenant[Merchant ownership and staff shop grant]
  Tenant --> Lock[Merchant lock and current version]
  Lock --> Commit[(One PostgreSQL transaction)]
  Commit --> Profile[Canonical profile]
  Commit --> Audit[Append-only audit]
  Commit --> Job[Durable job]
  Proof --> Operator[Separate operator permission and scope]
  Operator --> Sensitive[Fresh MFA for replay or sensitive action]
```

Private page policy also runs before HTML/Flight streaming. Domain/handler authorization remains required. Customers continue browsing without authentication.

## R1 credential and invitation revocation

```mermaid
flowchart TD
  Reset[Password changes or factor removed] --> Epoch[Rotate credential generation]
  Epoch --> Revoke[Revoke sessions, proofs and pending challenges]
  Attempt[In-flight password or MFA verification] --> Compare{Observed generation still current?}
  Epoch --> Compare
  Compare -->|No| Deny[Reject completion and suppress new cookies]
  Compare -->|Yes| Verify[Complete native verification and current-session policy]
  Owner[Issuer loses active-owner authority] --> Invites[Revoke unaccepted invitations in same transaction]
  Accept[Recipient accepts invitation] --> Lock[Acquire merchant lock]
  Lock --> Check[Recheck session, step-up and wall-clock expiry]
  Invites --> Check
  Check --> Decision{All current checks pass?}
  Decision -->|Yes| Commit[Commit membership, audit and job]
  Decision -->|No| Refuse[Deny without membership change]
```

Migration 007 invalidates old MFA proofs while preserving users and sessions. [R1 evidence](evidence/R1-REVIEW.md) records actual factor/reset races, lock-wait expiry/logout tests and database preservation. Ordinary operations already authorized at their final check are not promised retroactive cancellation.

## Implemented X1 job recovery

```mermaid
stateDiagram-v2
  [*] --> pending: domain transaction commits
  pending --> running: claim and unique lease token
  running --> done: idempotent effect then acknowledgment
  running --> pending: lease expires or retryable failure
  running --> dead: attempt budget exhausted
  dead --> pending: scoped operator with fresh MFA replays
  done --> [*]
```

The separate worker reads canonical versions, fences old leases and uses a durable effect receipt. Local notifications use an atomic private file keyed by job ID. Forced process-death tests cover commit, effect and delivery boundaries; real provider delivery still requires its own idempotency evidence.

## Initial canonical relationships

```mermaid
erDiagram
  USER ||--o{ SESSION : authenticates
  SESSION ||--o| MFA_PROOF : verifies
  USER ||--o{ MEMBERSHIP : joins
  MERCHANT ||--o{ MEMBERSHIP : authorizes
  MERCHANT ||--o{ SHOP : owns
  MALL ||--o{ SHOP : groups
  SHOP ||--o{ STAFF_SHOP_GRANT : scopes
  SHOP ||--o{ DEPARTMENT : contains
  DEPARTMENT ||--o{ PRODUCT : groups
  SHOP ||--|| PUBLICATION : separates
  SHOP ||--|| TENANCY : separates
  SHOP ||--|| MODERATION : separates
  MERCHANT ||--o{ APPLICATION : applies
  APPLICATION ||--o{ INVOICE : precedes_shop
  INVOICE ||--o{ RENT_EVENT : records
  MERCHANT ||--o{ AUDIT_EVENT : audits
  MERCHANT ||--o{ JOB : queues
```

Composite database keys additionally enforce tenant/shop agreement; the diagram omits those columns for readability. Future feature schemas and command transitions evolve through new reviewed migrations.

## Implemented anonymous preview journey

```mermaid
flowchart LR
  Entrance[Mall entrance] --> Search[Search shoes]
  Search --> Result[Annette Fashion House result]
  Result --> Shoes[Annette shoes department]
  Shoes --> Product[Illustrated canvas sneakers]
  Product --> Shop[Browse the whole shop]
  Shop --> Dresses[Dresses and other departments]
  Product --> Notice[Clear fictional-product notice]
```

No account or AI call is needed for this path. Purchases and enquiries remain unavailable in the read-only preview.

## Model handoff sequence

```mermaid
flowchart LR
  H[Sol 6.1 High foundation] --> Reminder[Save evidence and remind owner]
  Reminder --> Confirm[Owner confirms Extra High setting]
  Confirm --> X1[Sol 6.1 Extra High security and persistence]
  X1 --> Astra[Owner switches to 6 Astra Extra High review]
  Astra --> R1[Save R1 findings, fixes and evidence]
  R1 --> Switch[Owner confirms Sol 6.1 Extra High]
  Switch --> X2[X2 catalogue, contact and media]
  X2 --> P6[P6 safe manual design and publication]
  P6 --> P7[P7 eligible public discovery and benchmark]
  P7 --> P8[P8 local applications and development rent]
  P8 --> Admin[P8 local teams, addresses and scoped operations]
  Admin --> Trust[P9 local reporting, moderation and independent appeals]
  Trust --> Next[Remaining P9 governed privacy and costs before later gates and Astra R2]
```

The assistant records the next setting in BUILD-STATUS. The owner operates the model selector; the assistant does not switch it automatically.

## Local artwork inventory

- `mall.svg`: independent shops around a shared courtyard.
- `shop-*.svg`: six category-specific sample storefronts.
- `product-*.svg`: ten product/service illustrations, marked as samples.

The application renders these fixed trusted SVGs with explicit dimensions and lazy loading except for initial hero/product art. Tenant SVG uploads are rejected by the implemented X2 media policy; only bounded single-frame JPEG, PNG and WebP are accepted.

Validated screenshots and their exact stage/environment are recorded in [the High-stage evidence report](evidence/HIGH-STAGE.md).

The [X1 evidence report](evidence/X1-STAGE.md#visual-evidence) records inspected desktop shop-profile and mobile account-security screenshots from the local production build. All pictured identities and shops are fictional; no authentication secrets are pictured.

## Implemented X2 private-media path

```mermaid
flowchart TD
  Merchant[Authorized merchant or granted staff] --> Reserve[Owned expiring upload session and atomic quota reservation]
  Reserve --> Upload[Bounded bytes with matching declared type and length]
  Upload --> Quarantine[(Private PostgreSQL quarantine)]
  Upload --> Job[Durable processing job in same transaction]
  Job --> Decode[Independent worker validates signature, pixels and single frame]
  Quarantine --> Decode
  Decode --> Reject[Rejected image, quarantine removed and reservation released]
  Decode --> Encode[Rotate, strip metadata and generate bounded WebP variants]
  Encode --> Fence[Recheck lease, asset version and canonical state]
  Fence --> Ready[(Private ready variants and effect receipt)]
  Ready --> Read[Current scoped authenticated thumbnail, card or display read]
  Ready --> Public[Public read rechecks eligible published shop and active product attachment]
```

Raw quarantine and the normalized rebuild source have no public or workspace download route. A pending replacement leaves the product's prior ready image attached. Referenced assets cannot be deleted; expiry cleanup and tombstones prevent delayed jobs from resurrecting deleted media.

## Implemented X2 guest-request path

```mermaid
flowchart LR
  Customer[Anonymous customer] --> Contact[Enabled contact page with canonical eligibility]
  Contact --> Submit[Exact origin, bounded body and atomic abuse budgets]
  Submit --> Check[Recheck shop and optional product under merchant lock]
  Check --> Retry{Idempotency key and fingerprint}
  Retry -->|Same request| Receipt[Return prior received receipt]
  Retry -->|New request| Commit[(Request and local notification job)]
  Commit --> Receipt
  Commit --> Inbox[Scoped merchant inbox]
  Inbox --> Ack[Acknowledge or close with version check and audit]
```

A received or acknowledged request does not confirm an order, payment or stock reservation. Private customer details stay in the scoped inbox; notification payloads contain identifiers only. Live retention and delivery policies remain owner decisions.

The [X2 evidence report](evidence/X2-P5.md) includes inspected production-browser screenshots of the [catalogue and inbox](evidence/images/x2-catalogue-desktop.png) and [anonymous contact page](evidence/images/x2-guest-contact.png). They contain fictional/sample data, without authentication secrets.

## Implemented X2 design and public eligibility

```mermaid
flowchart TD
  Editor[Current design and shop grant] --> Validate[Closed LSS schema, budgets and owned references]
  Validate --> Draft[(Immutable draft revision and audit)]
  Draft --> Preview[Authorized private preview]
  Draft --> Patch[Version-checked manual patch or restoration]
  Patch --> Draft
  Preview --> Confirm[Explicit merchant confirmation and fresh publish authority]
  Confirm --> Publish[(Atomic published pointer and audit)]
  Publish --> Read[Current canonical catalogue and contacts]
  Read --> Eligibility{Publication active, tenancy active/due/grace, moderation clear, no operations hold}
  Eligibility -->|Eligible| Public[Dynamic no-store shop, search and ready-image responses]
  Eligibility -->|Unavailable| Deny[Platform unavailable state without restricted contents]
  Publish --> Index[PostgreSQL generated search vectors in canonical transactions]
  Index --> Public
```

Restoring a layout never restores an old price/contact/payment setting. The renderer uses a read-only snapshot and current canonical resources; request-local memoization avoids duplicate metadata/page reads without a shared response cache. Future remote browser/CDN revocation and live financial/provider policies require separate evidence.

Inspected X2 prototype captures: [merchant design](evidence/images/x2-design-desktop.png), [public product with a synthetic ready image](evidence/images/x2-public-product.png) and [mobile search on the isolated 1,500-shop dataset](evidence/images/x2-architecture-search.png). See [the complete experiment and limits](evidence/X2-P6-P7.md).

## Implemented P8 development lifecycle

```mermaid
flowchart TD
  Owner[Authenticated owner] --> Draft[Versioned application and private normalized evidence]
  Draft --> Submit[Confirm submission and retain snapshot]
  Submit --> Review[Scoped reviewer with native MFA]
  Review -->|Needs information| Draft
  Review -->|Approved with reason| Invoice[Referenced invoice and immutable policy]
  Invoice --> Finance[Separately scoped finance operator with fresh MFA]
  Finance --> Check[Compare invoice reference, currency, amount and unique receipt]
  Check -->|Partial credit| Pending[Retain credit without provisioning]
  Check -->|Fully settled| Atomic[(One transaction: ledger, coverage, capacity, unpublished shop, tenancy, audit and jobs)]
  Atomic --> Workspace[Owner configures catalogue, contacts and design]
  Workspace --> Publish[Explicit publication with current authority]
  Publish --> Public[Canonical eligible public discovery and contact]
  Atomic --> Worker[Scheduled reminders using current coverage and credits]
  Worker --> Due[Due then grace then closed at the policy boundary]
  Finance --> Reverse[Linked negative correction retains original history]
  Reverse --> Debt[Arrears close eligibility and preserve shop data]
  Due --> Renewal[Verified full renewal]
  Debt --> Correct[Verified correction within original coverage]
  Renewal --> Eligibility[Recompute tenancy without changing moderation or publication]
  Correct --> Eligibility
  Eligibility --> Public
```

This is a development workflow: **UGX 5,000 per 30 days, seven days’ grace and manual operator reconciliation; live collection disabled**. Stable command keys, append-only financial events and merchant locks prevent duplicate credit/provisioning. An old job cannot carry an authoritative payment date. Only new P8 contracts enter the scheduler; previous fixtures remain unchanged. See [ADR-0006](ADR/0006-local-applications-and-rent-lifecycle.md) and [P8 verification/screenshots](evidence/X2-P8.md).

## Implemented P8 team and address continuity

```mermaid
flowchart TD
  Owner[Fresh current owner] --> Team[Bounded private team and current merchant revision]
  Team --> Command[Explicit confirmed command with expected revision]
  Command --> Lock[Merchant lock and rechecked owner authority]
  Lock --> Compare{Revision still current?}
  Compare -->|No| Conflict[Reload and review conflicting change]
  Compare -->|Yes| Commit[(Membership change, next revision and audit)]
  Commit --> Invite[Private email-bound one-use invitation]
  Invite --> Recipient[Verified recipient enters token privately]
  Recipient --> Accept[Recheck session, expiry and issuer under merchant lock]
  Accept --> Joined[Membership and next merchant revision]
  Joined --> Grant[Owner separately grants staff shop access]
  Owner --> Address[Versioned address command with reason]
  Address --> Registry[(Permanent current and former slug reservations)]
  Registry --> Resolve[Old address or immutable shop ID]
  Resolve --> Eligible{Current public eligibility?}
  Eligible -->|Yes| Redirect[Redirect to current canonical address]
  Eligible -->|No| Hidden[Unavailable without private shop disclosure]
```

Last-owner protection and issuer-invitation revocation remain active. A token is not a URL, and membership alone does not give staff shop access. The address registry is append-only; direct SQL cannot transfer an old address to another shop.

## Implemented P8 scoped operations and independent holds

```mermaid
flowchart TD
  Operator[Explicit operations grant and native MFA] --> Queue[Minimal shop queue and aggregate mall occupancy]
  Queue --> Claim[Fresh claim with reason and no merchant self-membership]
  Claim --> Scope[(Distinct operations shop scope)]
  Scope --> Command[Confirmed versioned command with reason]
  Command --> Lock[Merchant lock and current authority recheck]
  Lock --> Move[Mall move also acquires shared provisioning capacity lock]
  Move --> Capacity{Target has capacity?}
  Capacity -->|Yes| Assign[Change only mall assignment plus version and audit]
  Capacity -->|No| Refuse[Conflict without moving shop]
  Lock --> Hold[(Pause or remove independent operational hold; retain audit)]
  Hold --> Eligibility{Published design, eligible tenancy, clear moderation, no hold?}
  Rent[Canonical rent and scheduled tenancy] --> Eligibility
  Moderation[Separate trust decisions] --> Eligibility
  Publish[Explicit merchant publication] --> Eligibility
  Eligibility -->|Yes| Public[Shop, search, contact and ready media]
  Eligibility -->|No| Hidden[Public disclosure denied]
  Finance[Finance grant and claimed application-finance scope] --> Exceptions[Scoped unsettled invoice exceptions]
```

Resume removes only the hold. It cannot credit an invoice, renew rent, publish a draft or clear moderation. Capacity moves preserve identity, address, ownership, catalogue and financial history. [Administration evidence](evidence/X2-P8-ADMIN.md) records races, scoped HTTP/Flight denial, upgrade preservation and inspected [desktop team](evidence/images/x2-p8-team-desktop.png), [desktop operations](evidence/images/x2-p8-operations-desktop.png) and [mobile team](evidence/images/x2-p8-team-mobile.png) captures. All pictured data is fictional.

## Implemented P9 private reporting and review

```mermaid
flowchart TD
  Customer[Anonymous fictional concern] --> Intake[Exact origin, bounded body, atomic budgets and UUID retry key]
  Intake --> Receipt[Generic received receipt without private target or case metadata]
  Intake --> Report[(Immutable report and case; no automatic restriction)]
  Customer --> Capability[Private browser-memory capability; only hash stored]
  Capability --> Image[One image within 30 minutes before any claim]
  Image --> Decode[Secure bounded decode and metadata-free WebP]
  Decode --> Private[(Immutable private image; raw bytes discarded)]
  Reviewer[Native fresh MFA and moderation permission] --> Claim[Reasoned case claim; reject merchant self-membership]
  Claim --> Scope[(Distinct trust-case scope; freeze upload)]
  Scope --> Read[Private report, image, notes and bounded history]
  Report --> Read
  Private --> Read
  Read --> Decide[Confirmed current case and moderation versions; recheck after merchant lock]
  Decide --> Commit[(Atomic case, moderation, audit, events and private owner notice)]
```

Report/capability text never enters public rendering or local notice payloads. Finance/support/operations grants and scopes do not substitute for a trust case. Public badge state is derived separately from approved P8 application review and disclosed only as a fictional development review.

## Implemented P9 appeals and independent eligibility

```mermaid
flowchart TD
  Owner[Fresh own-shop owner] --> Redacted[Merchant-facing decisions; private report and notes omitted]
  Redacted --> Appeal[Confirmed versioned appeal; one pending]
  Appeal --> Second[Different reviewer with native fresh MFA and claimed case]
  Second --> Clear[Reasoned reinstatement removes only this case restriction]
  Clear --> Strongest{Strongest remaining case plus immutable legacy baseline}
  Other[Other case restrictions] --> Strongest
  Legacy[Captured legacy moderation] --> Strongest
  Strongest --> Moderation[Canonical shop moderation]
  Moderation --> Eligibility{Published design, eligible tenancy, clear moderation and no hold?}
  Rent[Unchanged canonical tenancy and financial history] --> Eligibility
  Publication[Unchanged explicit publication] --> Eligibility
  Hold[Independent operational hold] --> Eligibility
  Eligibility -->|Yes| Public[Shop, aliases, search, contact, guest intake and ready media]
  Eligibility -->|No| Hidden[Public disclosure or intake denied]
```

External moderation conflicts fail closed; clearing one case cannot clear another or a captured legacy restriction. [P9 evidence](evidence/X2-P9.md) records inspected [desktop report](evidence/images/x2-p9-report-desktop.png), [private review](evidence/images/x2-p9-review-desktop.png) and [mobile report](evidence/images/x2-p9-report-mobile.png) captures. All pictured content is fictional; no authentication secrets are pictured.

## Implemented P9 accountable incident queues

```mermaid
flowchart TD
  Owner[Fresh current owner] --> Intake[Seven bounded incident kinds; immutable reporter and retry key]
  Intake --> Case[(Versioned case and append-only events)]
  Operator[Explicit kind permission and native MFA] --> Queue[Minimal prioritized queue; escalated then priority and age]
  Queue --> Claim[Reasoned versioned claim; reject self-membership]
  Claim --> Assignment[(Exclusive reviewer and separate incident scope)]
  Assignment --> Private[Fresh scoped private investigation]
  Case --> Private
  Private --> Note[Private notes and priority]
  Private --> Escalate[Reasoned escalation with separate owner explanation]
  Escalate --> Release[Release assignment and every incident scope]
  Release --> Queue
  Private --> Resolve[Reasoned resolution; retain history]
  Private --> Existing[Separate trust, finance or application authority for those decisions]
```

Kind grants do not confer other workflow scopes. Ordinary support cannot contain accounts or restore sensitive contacts. Escalation supports qualified reassignment; live response targets and staff ownership remain a policy gate.

## Implemented P9 original-owner confirmed restoration

```mermaid
flowchart TD
  Original[Original fresh reporting owner] --> Target[Select exact earlier immutable contact revision]
  Target --> Incident[Contact-change incident; target fixed]
  Incident --> Assigned[Assigned recovery reviewer with native fresh MFA]
  Assigned --> Contain[Optional once-per-case reporting-owner session containment]
  Contain --> Rotate[(Rotate credential generation; revoke sessions, proofs, challenges and old reset tokens)]
  Rotate --> Native[Owner uses native password and MFA or existing recovery code]
  Native --> Confirm[Original still-active owner confirms exact snapshot and current versions]
  Original --> Confirm
  Confirm --> Approval[(30-minute approval bound to owner credential generation)]
  Assigned --> Restore[Reasoned confirmed restoration request]
  Approval --> Restore
  Restore --> Locks[Merchant and reporter-user locks; recheck both authorities]
  Locks --> Valid{Current versions, owner membership, generation and unexpired approval?}
  Valid -->|No| Refuse[Conflict or denial; no canonical correction]
  Valid -->|Yes| Commit[(Validate old snapshot; append new contacts, event, audit and minimal notice)]
  Commit --> History[Retain baseline and every intervening revision]
  Commit --> Independent[Rent, ledger, publication, moderation and operational holds unchanged]
```

Captured history starts at the current upgrade baseline. Containment/password changes invalidate confirmation; later contact edits require renewed confirmation. There is no lost-all-factor/email/ownership adjudication bypass or direct operator contact update.

[Incident evidence](evidence/X2-P9-INCIDENTS.md) records the inspected [assigned reviewer](evidence/images/x2-p9-incident-review-desktop.png), [redacted owner history](evidence/images/x2-p9-incident-owner-desktop.png) and [mobile keyboard-focused form](evidence/images/x2-p9-incident-mobile.png). All pictured data is fictional; no authentication secrets are pictured.

## Implemented P9 minimal pilot observations

```mermaid
flowchart TD
  Public[Eligible canonical public page] --> Flag{Explicit fictional local database capture?}
  Flag -->|No| Browse[Browsing and contact remain available]
  Flag -->|Yes| Context[Signed rendered-page context; 30-minute expiry]
  Context --> Browser[Bounded tab source: direct, discovery or unattributed]
  Browser --> Async[Lossy asynchronous event; navigation never waits]
  Async --> Filter[Exact origin, strict fields, privacy and practical bot/internal filters]
  Filter --> Eligibility[Current canonical target and contact-channel checks]
  Eligibility --> Atomic[(Atomic hashed receipt, minute budgets and daily count)]
  Atomic --> Metrics[(Day, canonical scope, event, source, bounded detail and count)]
  Async -->|Failure or limit| Browse
  Writes[Successful canonical publish/catalogue transaction] --> Audit[(Existing committed tenant-consistent audit history)]
  Audit --> Activity[Separate canonical merchant counts]
  Metrics --> Owner[Fresh current owner; recheck after merchant lock]
  Metrics --> Operator[Explicit analytics grant and native fresh MFA; final query recheck]
  Activity --> Owner
  Activity --> Operator
  Operator --> Summary[Cohort, measured first publication, net-paid/waiver renewal and backlog counts]
```

No visitor identity, raw query/IP/referrer or private evidence enters metrics. Receipt identity belongs to a rendered context, not a person. Blocked storage remains unattributed; contact intent is not a completed sale. Analytics storage never participates in canonical merchant transactions. Operators receive aggregate summaries without private case/ledger viewers or decision authority.

```mermaid
flowchart LR
  Policy[Development retention: 7–90 UTC days; default 30] --> Read[Immediate retained-day query cutoff]
  Policy --> Worker[Existing lease-fenced maintenance]
  Worker --> Receipts[Delete up to 1000 expired hashed receipts]
  Worker --> Metrics[Delete up to 1000 expired daily groups]
  Invalid[Invalid retention] --> Stop[Disable capture and aggregate deletion]
  Offline[Worker offline] --> Pending[Physical cleanup pending; read cutoff still applies]
```

This cleanup governs minimal analytics tables only. Broader evidence/enquiry/incident/legal/backups export/deletion and measurable costs remain later P9 work. [Analytics evidence](evidence/X2-P9-ANALYTICS.md) records inspected [owner desktop](evidence/images/x2-p9-analytics-owner-desktop.png), [analytics-only operator desktop](evidence/images/x2-p9-analytics-operator-desktop.png) and [mobile window/keyboard focus](evidence/images/x2-p9-analytics-mobile.png). All pictured data is fictional; live analytics is disabled.

## Implemented local privacy governance

```mermaid
flowchart TD
  Owner[Fresh current merchant owner] --> Export[Bounded allowlisted section download; no bearer link]
  Owner --> Request[Exact resource, immutable retry key, reason and confirmation]
  Request --> Claim[Explicit privacy grant and native fresh MFA; separate assignment/scope]
  Claim --> Decision{Manual current-version review}
  Decision --> Hold[Exact-target retention hold; private reason and safe explanation]
  Hold --> Release[Reasoned release; hold history retained]
  Release --> Decision
  Decision --> Retain[Protected history or ineligible resource retained]
  Decision --> Approve[Explicit local flag; exact plan/session; five-minute approval]
  Approve --> Worker[Independent current lease-fenced worker]
  Worker --> Check{Current authority, scope, holds, age, plan and deadline?}
  Check -->|No| Review[No primary effect; fresh review required]
  Check -->|Yes| Atomic[(SQL effect plus immutable history/audit and job dedupe)]
  Atomic --> Enquiry[Scrub three enquiry fields; keep minimal retry receipt]
  Atomic --> Evidence[Delete eligible rejected nonfinancial evidence bytes only]
  Atomic --> Analytics[Delete shop counts; permanent opt-out fences waiting capture]
  Atomic --> Result[Primary SQL completion only]
  Result --> Gates[Backups, WAL, snapshots, notifications, downloads and external copies remain obligations]
```

Erasure is default-off fictional loopback functionality. Financial/account/trust/incident/contact/audit history remains retained, and arrears closure never deletes data. Holds survive cancelled/denied/unassigned requests. These diagrams do not establish live legal erasure or physical backup handling. See [privacy evidence](evidence/X2-P9-PRIVACY.md) and the inspected fictional [owner desktop](evidence/images/x2-p9-privacy-owner-desktop.png), [scoped reviewer desktop](evidence/images/x2-p9-privacy-review-desktop.png) and [mobile accessible cancellation](evidence/images/x2-p9-privacy-mobile.png) captures.


## P9 measured resources and reported operating costs

[ADR-0012](ADR/0012-local-resource-cost-reporting.md) and [cost evidence](evidence/X2-P9-COSTS.md) distinguish current logical snapshots, manual reporting and missing measurements. No path creates a merchant charge or changes existing jobs.

```mermaid
flowchart TD
  Blobs[Canonical managed SQL blob lengths] --> Snapshot[Current logical media and queue snapshots]
  Quota[Recorded quota and reserved headroom] --> Snapshot
  Jobs[Tenant-consistent current job state and counters] --> Snapshot
  Snapshot --> Owner[Fresh current owner: safe own-shop aggregates]
  Snapshot --> Platform[Explicit costs grant and native fresh MFA]
  Shared[Separate platform and merchant shared jobs] --> Platform
  Evidence[Coarse application and trust evidence volume] --> Platform
  Platform --> Claim[Reasoned current-version shop scope claim]
  Claim --> Journal[Private shop journal: native grant and scope rechecks]
  Journal --> Original[Reported integer minutes and UGX expenses]
  Original --> Correction[One exact linked negative correction]
  Original --> Totals[Net totals by original UTC work day]
  Correction --> Totals
  Totals --> Owner
  Missing[Unavailable bandwidth, AI, prices and independent staff time] --> Disclosure[Unknown actual costs and reporting coverage]
  Disclosure --> Owner
  Disclosure --> Platform
```

Shared jobs and pre-shop evidence are not allocated by invented estimates. Reserved bytes are headroom; missing quota is unavailable. Authorized replay can reset current attempt counters. Manual amounts keep minutes/money separate, with no hourly rate or provider-billing claim. Immutable original/correction history and UTC windows preserve interpretation.

The following fictional captures were inspected for readable labels, limits, private-owner redaction and bounded layout; native tests cover keyboard/accessibility and overflow. Operator journal reasons are private fictional fixture text, without credentials or real personal information.

![Fresh owner desktop resource and reporting summary](evidence/images/x2-p9-costs-owner-desktop.png)

![Scoped native-MFA operator reporting and exact-correction controls](evidence/images/x2-p9-costs-journal-desktop.png)

![Mobile owner summary with UTC windows and explicit missing measurements](evidence/images/x2-p9-costs-mobile.png)

## P10 native proposal workflow

| Illustration | Source and meaning |
|---|---|
| [Desktop assistant](evidence/images/x2-p10-assistant-desktop.png) | Production-build native owner workflow in a disposable fictional database; validated deterministic blue-theme proposal, no provider calls, separate preview/confirmation. |
| [Canonical candidate preview](evidence/images/x2-p10-proposal-preview.png) | Unsaved private candidate rendered by the existing canonical LSS renderer; no draft/publication/analytics effects, with explicit return to review. |
| [Mobile assistant](evidence/images/x2-p10-assistant-mobile.png) | Native keyboard-triggered deterministic contact-action proposal, labelled confirmation, unavailable live providers and separate reported-usage explanations; no overflow/axe violations in the recorded viewport. |

These three captures were visually inspected. They are fictional local workflow evidence, not live Gemini/OpenAI demonstrations or manual screen-reader certification. Prior packet illustrations remain preserved. [P10 evidence](evidence/X2-P10.md) records security/verification/preservation limits; the [design pipeline](SHOP-DESIGN-PIPELINE.md) diagrams the implemented boundary.

## P11 semantic shops, continuation and measured load

| Illustration | Recorded meaning |
|---|---|
| [Desktop catalogue](evidence/images/x2-p11-catalogue-core-desktop.png) / [mobile catalogue](evidence/images/x2-p11-catalogue-core-mobile.png) | Production native 20-row department continuation with 46 fictional items and a next-page link. Most fixture items intentionally have no photo. |
| [Earth](evidence/images/x2-p11-template-earth.png), [plum](evidence/images/x2-p11-template-plum.png), [blue](evidence/images/x2-p11-template-blue.png) | All eight new/old compatible semantic spaces on a 390×844 emulated mobile device; photograph/filters/gallery/service desk resolve canonical data. Repeated coffee images are the attributed CC0 fixture, not merchant products. |
| [Bounded shop-first search](evidence/images/x2-p11-search.png) | Twenty eligible shop results and continuation from the generated scale dataset. |
| [Load and saturation plot](evidence/images/x2-p11-load.png) | Final actual p50/p95/p99/throughput at 1/5/20/40 clients; 40 is a diagnostic overload phase. |

All six captures and the plot were visually inspected for readable labels, bounded layout/navigation and factual captions. Native tests verify keyboard/labels/axe/overflow; the experiment validates three rendered templates under reduced motion, 4× CPU slowdown and 150 ms/1.6 Mbps emulation. These captures do not certify actual handset/Ugandan-network or screen-reader user sessions. Photo attribution is retained in [fixture provenance](../tests/fixtures/README.md); [P11 evidence](evidence/X2-P11.md) records the final gate and limits. Historical illustrations remain unchanged.

```mermaid
flowchart LR
  Forms[Native semantic forms or private AI proposal] --> Validate[Strict shared LSS and current owned references]
  Validate --> Preview[Private canonical preview]
  Preview --> Confirm[Confirmed draft]
  Confirm --> Publish[Separate fresh publication]
  Publish --> Read[Two independent web processes]
  Read --> SQL[(Canonical eligibility and bounded PostgreSQL reads)]
  Mutation[Catalogue transaction] --> Counter[Per-shop generation increment]
  Counter --> SQL
  SQL --> Cursor[20 rows and scoped continuation]
  Cursor --> Restart[Explicit restart after catalogue change]
```
