# Londos Architecture Stress Test

## Purpose

This document tries to break Londos before customers do. The goal is not to prove the architecture is good; it is to identify where the business model, user experience, security or infrastructure can fail and define a safe response.

## Reference lifecycle: Annette Fashion House

### 1. Application

Annette wants to rent a shop.

**Expected flow**
1. Annette enters the merchant application surface.
2. She provides identity/business/contact information required by current policy.
3. Londos creates an application, not an active public shop.
4. The Landlord reviews verification and eligibility.
5. Approval creates/links the merchant identity and permits first rent payment.
6. A successful tenancy activation allocates an immutable shop ID and internal mall assignment.

**Failure cases**
- duplicate applications;
- fake/borrowed identity;
- impersonation of a known business;
- prohibited-goods applicant;
- automated/spam applications;
- landlord approves wrong applicant;
- payment succeeds but activation fails;
- activation succeeds twice after payment retry.

**Requirements**
- application IDs and explicit states;
- duplicate/risk signals;
- auditable operator decisions;
- idempotent payment/activation operations;
- separate application, merchant, tenancy and shop records;
- manual review path for ambiguity.

### 2. First rent

Rent is a tenancy event, not a website subscription toggle.

**Failure cases**
- merchant pays but provider callback is delayed;
- callback arrives twice;
- merchant claims payment that cannot be verified;
- payment is reversed;
- wrong shop/reference is paid;
- amount differs from invoice;
- platform payment integration is unavailable.

**Requirements**
- immutable rent ledger/events;
- provider/reference IDs where integrated;
- idempotency;
- reconciliation;
- manual correction with audit trail;
- tenancy state must not be inferred solely from a frontend success page.

### 3. Shop creation

Annette receives a shop identity such as `SHOP-UG-00000451`.

**Failure cases**
- slug collision;
- shop name later changes;
- Annette owns multiple shops;
- Annette adds staff;
- merchant account is compromised;
- internal mall reaches operational capacity.

**Requirements**
- immutable `shop_id`, mutable slug/display name;
- many-to-many user/shop memberships with roles;
- internal mall assignment independent of public identity;
- assignment service that understands capacity;
- re-assignment/migration must not break public shop identity.

### 4. Shop design

Annette says:

> “I sell women's clothes and shoes. Make dresses first, new arrivals at the entrance, shoes separate and keep WhatsApp visible.”

**Failure cases**
- AI misunderstands request;
- generated layout is inaccessible/slow;
- malicious prompt tries to inject script;
- layout references components not available;
- merchant dislikes result;
- AI provider is offline.

**Requirements**
- AI produces a versioned structured Shop Specification;
- schema validation before preview/publish;
- merchant sees preview and explicitly publishes;
- rollback/version history;
- deterministic template/manual controls remain available if AI fails;
- no arbitrary generated production code.

### 5. Catalogue and media

Annette adds 100 products and large phone-camera photos.

**Failure cases**
- 7–20 MB photos;
- unsupported/corrupt media;
- malware/polyglot upload;
- duplicate uploads;
- processing worker fails;
- merchant exceeds storage allowance;
- image processing is slow.

**Requirements**
- direct/controlled upload path with limits;
- quarantine/validation;
- asynchronous transformation;
- multiple optimized variants;
- processing state visible to merchant;
- quotas;
- failed-media retry;
- storefront never waits for raw-media transformation.

### 6. Publication

Annette publishes.

**Failure cases**
- cache still shows old price;
- search index is stale;
- product removed but remains discoverable;
- merchant publishes prohibited content;
- two admins edit simultaneously.

**Requirements**
- canonical DB write first;
- publication/version marker;
- targeted cache invalidation;
- search indexing event;
- eventual consistency must have a defined freshness objective;
- moderation controls;
- optimistic concurrency/version checks for conflicting edits.

### 7. Customer discovers shoes

A customer searches globally for shoes.

**Desired behavior**
1. Query is normalized.
2. Only public/eligible shops are searchable.
3. Matching inventory contributes to relevance.
4. Results preserve shop identity.
5. Annette appears because her shop contains relevant shoes.
6. Selecting Annette routes into the matching department/product context.
7. Customer remains free to browse Annette's full shop.

**Failure cases**
- one merchant keyword-stuffs thousands of products;
- sponsored result masquerades as relevance;
- unavailable product dominates result;
- Mall 1 receives preferential ranking over Mall 4;
- query takes seconds;
- typo/local-language query returns nothing;
- duplicate near-identical products overwhelm results.

**Requirements**
- eligibility filtering before ranking;
- shop-level diversity/caps;
- anti-spam signals;
- availability/freshness inputs;
- internal `mall_id` must not create arbitrary public ranking advantage;
- transparent labeling of future paid promotion;
- query analytics without blocking request;
- pagination/cursors.

### 8. Customer enters Annette's shop

No login wall.

**Failure cases**
- merchant's design is too heavy;
- broken image;
- WhatsApp number changed;
- malicious content;
- customer's connection drops;
- merchant is suspended while customer has page open.

**Requirements**
- platform-controlled performance budget;
- safe components;
- cached shell/content where appropriate;
- lazy media;
- graceful placeholders;
- authoritative public shop status checked within defined freshness;
- suspension can rapidly remove public eligibility.

### 9. Commerce/contact

Customer chooses Annette's WhatsApp/contact method.

**Failure cases**
- fake merchant changes payment number;
- customer sends money to impersonator;
- merchant falsely claims Londos guarantees transaction;
- harassment/spam;
- merchant disappears after payment.

**Requirements**
- verified merchant/contact indicators where justified;
- conspicuous distinction between Londos infrastructure and merchant transaction;
- report flow;
- immutable history/audit for sensitive merchant contact changes;
- step-up authentication for high-risk changes;
- consumer safety guidance;
- escalation and suspension capability.

### 10. Renewal and arrears

**Desired behavior**
```text
active → due/reminded → grace → temporarily closed → renewed/reopened
```

**Failure cases**
- reminder never sends;
- payment arrives during suspension;
- merchant disputes due date;
- job runs twice;
- shop data is deleted accidentally;
- customer sees closed shop in search.

**Requirements**
- explicit tenancy state machine;
- scheduled jobs must be idempotent;
- ledger is source of financial truth;
- closure removes shop from discovery while retaining data;
- reopening re-indexes/invalidate caches;
- destructive deletion is a separate governed process.

---

# Cross-system stress tests

## A. One logical mall reaches 1,500 shops

**Do not reject shop 1,501 merely because a database constant says so.**

The 1,500 figure is an operational planning threshold. When occupancy approaches the configured threshold:
1. Landlord sees capacity warnings.
2. A new logical mall can be provisioned.
3. New tenants can be assigned there.
4. Global search remains unchanged.
5. Merchant public identity does not advertise inferior/superior mall number.
6. Infrastructure placement can remain shared until physical scaling is needed.

**Invariant:** mall assignment is an internal operational property, not a customer-ranking entitlement.

## B. Search service fails

The entire mall should not necessarily become inaccessible.

Degradation strategy:
- direct shop links continue;
- category pages may use cached/fallback listings;
- shop-local browsing continues if core DB/cache is healthy;
- global search displays a clear temporary failure rather than fabricated results.

## C. Database unavailable

Writes stop safely. Cached public pages may remain readable for a bounded period if policy permits, but:
- do not accept merchant changes that appear committed when they are not;
- do not fabricate rent/payment state;
- recovery procedures determine return to write service.

## D. Cache unavailable

Correctness before speed. Fall back to canonical/read infrastructure with rate/load protection. Cache failure must not silently expose private data.

## E. Media storage/CDN outage

Shop HTML/catalogue can remain available with placeholders where possible. Contact details and text product information should not disappear merely because an image CDN has an incident.

## F. Worker queue backlog

Public browsing remains functional. Merchant UI shows media/index jobs as pending. Alert operations when queue age/backlog exceeds thresholds.

## G. Landlord account compromise

This is a catastrophic-risk scenario.

Controls:
- mandatory MFA;
- least privilege and separate roles;
- step-up authentication for destructive/high-impact operations;
- audit log;
- bulk-operation safeguards;
- no single click permanently destroys all tenant data;
- recovery/revocation runbook.

## H. Merchant account compromise

Attacker may change contact/payment instructions.

Controls:
- MFA;
- login/risk notifications;
- re-authentication for sensitive changes;
- audit history;
- optional cooling period/alert for payment/contact changes;
- rapid merchant recovery/support process.

## I. Viral traffic

One merchant's post becomes viral.

Requirements:
- CDN absorbs static/media load;
- cached shop pages;
- rate limits at expensive dynamic endpoints;
- search/analytics cannot block storefront;
- autoscaling or capacity headroom appropriate to deployment;
- hot tenant must not exhaust resources for every other shop.

## J. Backup failure

Backups are monitored. Periodic restore tests prove recovery. Maintain at least one independent encrypted off-site copy.

---

# Highest-risk assumptions

1. **UGX 5,000 rent can support operations.** This is a business hypothesis, not yet proven.
2. **Merchants will self-onboard/design shops.** If support becomes manual, low rent can become uneconomic.
3. **Shared mall discovery adds meaningful value over a WhatsApp/standalone link.**
4. **Customers understand shop-first search rather than expecting product-first marketplace checkout.**
5. **Merchant-controlled commerce can maintain sufficient customer trust without Londos controlling payment.**
6. **Verification/moderation costs can remain affordable.**
7. **Conversational design can produce attractive, safe shops without creating support burden.**

These seven assumptions deserve evidence before expensive scaling work.
