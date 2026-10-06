# First Londos Pilot Experiment

## Question

Does a shared digital mall create enough additional value over a merchant's existing WhatsApp/social/direct selling workflow that merchants will use it, share it and pay recurring rent?

## Cohort

Target 10–20 real merchants.

Prefer diversity without making the pilot impossible to support:
- fashion;
- shoes;
- electronics/accessories;
- beauty;
- food/restaurant or service business;
- one visually heavy/showroom-style merchant if feasible.

## Before onboarding

For each merchant record baseline:
- current discovery channels;
- current digital presence;
- approximate catalogue size;
- how customers contact/order;
- biggest selling pain;
- willingness-to-pay expectation;
- current monthly digital spend if any.

Do not promise the 5K price permanently during research unless that business decision has been made.

## Pilot tasks

Ask merchant to:
1. complete application;
2. configure their shop;
3. add representative catalogue;
4. configure contact/commerce;
5. publish;
6. share their direct link through their normal channels;
7. maintain it for the pilot period.

Observe rather than doing everything for them.

## Customer routes

Measure separately:

### Direct traffic
Merchant shares Londos link → customer enters merchant shop.

### Discovery traffic
Customer enters Londos/search/category → discovers merchant they did not directly navigate to.

The second route is central to the mall thesis.

## Core events

- mall_visit
- search_submitted
- search_results_viewed
- shop_result_clicked
- shop_viewed
- department_viewed
- product_viewed
- contact_action_clicked
- direct_link_entry
- merchant_publish
- merchant_catalogue_update

Avoid collecting unnecessary personal data merely because analytics permits it.

## Merchant interview after use

Ask behaviorally:
- What did you actually use?
- What was difficult?
- Did customers mention Londos?
- Did any customer find you through Londos rather than your link?
- What did you still use WhatsApp/Facebook/TikTok for?
- What would make you stop using Londos?
- Would you pay to keep this exact shop next month?
- If yes, how would you prefer to pay?
- Which feature would you pay extra for?

The most important evidence is actual renewal/payment, not polite enthusiasm.

## Go / revise / stop signals

### Go
- merchants self-publish with tolerable support;
- direct links get used;
- measurable discovery traffic exists;
- customers engage/contact;
- merchants maintain catalogues;
- meaningful share renews/pays;
- variable costs fit rent assumptions.

### Revise
- customers use shops but discovery is weak;
- merchants need too much setup help;
- search is confusing;
- merchants want a different rent/resource structure;
- contact conversion is weak but browsing is strong.

### Stop/rethink core model
- merchants will not maintain shops;
- customers consistently prefer existing channels with no incremental value;
- support/verification costs overwhelm realistic rent;
- fraud/trust makes merchant-controlled commerce unacceptable.

## Pilot output

The local development implementation now instruments all eleven named events under [ADR-0010](ADR/0010-local-pilot-analytics.md); see [analytics evidence](evidence/X2-P9-ANALYTICS.md). Nine public observations use minimal daily counts and observed direct/discovery/unattributed source; publication/catalogue events derive separately from committed audit history. Zero/few/many result buckets avoid storing search queries. Receipt identity is an expiring rendered-page context, not a visitor. Counts do not establish unique customers, causal discovery or completed sales, and blocked storage/scripts, privacy filters and outages can undercount.

Fresh owners receive their shop aggregates. Explicit native-fresh-MFA analytics operators receive application cohorts, measured first-publication duration, net-payment versus waiver-supported renewal and current case backlog counts/age. Unpublished applications are not zero-duration activations; reversed credits are deducted from renewal coverage. Backlog age is not measured staff working time. Local governed privacy and measurable resource/reporting views are verified below; full live legal/backups/subject-access remain P9.8 obligations. Capture is optional fictional loopback database functionality; live analytics remains disabled until the real privacy/legal/operational release gates are met. Local tests do not validate merchant willingness to pay or the business hypothesis.

Produce a decision report with:
- funnel;
- cohort retention/renewal;
- unit economics;
- support burden;
- discovery increment;
- trust incidents;
- architecture bottlenecks;
- product changes;
- pricing recommendation.

## Local privacy governance boundary

P9.8's [local privacy evidence](evidence/X2-P9-PRIVACY.md) verifies bounded owner business exports and manually governed fictional primary effects with default-off erasure, separate native-MFA privacy scopes, retention holds, explicit plan/version and current worker lease. Analytics erasure permanently excludes future shop capture while retaining platform/canonical history. This is not approved live privacy policy, full subject access or physical-backup erasure. Preserving minimal observation counts and testing privacy workflows do not prove merchant retention, causal discovery, sale conversion or pilot willingness to pay. P9.9 local reporting labels measured resource use separately from operator-reported work and unavailable provider/independent staff costs, as recorded below.


## Local cost reporting and pilot interpretation

[Cost evidence](evidence/X2-P9-COSTS.md) verifies current logical managed-media bytes, recorded quota/headroom, canonical shop-bound job counters and separate platform/shared totals. Queue replay resets attempt counts; these are not lifetime executions, CPU usage or provider fees. Private application evidence volume is a coarse platform total with no invented pre-shop allocation. Missing quota metadata and bandwidth/AI/provider price sources are explicitly unavailable.

Distinct scoped native-MFA costs operators may record support/verification/rent-collection minutes and UGX expenses with immutable original/reversal history. Fresh owners see only safe totals over 7/30/90 UTC work-day windows. Manual reporting completeness is unknown; minutes have no guessed hourly rate, an empty journal is unmeasured and a net-zero journal proves only its recorded sum. Backlog age is not independent working time. Reporting cannot credit rent or bill merchants; paid-versus-waiver renewal semantics remain unchanged.

These local views complete measurable P9.7/P9.9 development reporting. They do not establish actual unit economics, sustainable lowest rent, causal discovery, confirmed sales or willingness to pay. A real pilot needs approved price/billing sources, appropriately governed cost attribution and observed collection/staff coverage before making economic claims. Live collection/analytics and all main/live erasure remain disabled; P9.8 legal/backups/full subject-access and release gates remain open. P10 now records bounded provider-reported tokens/configured estimates with fixture/missing-usage labels; actual bills remain unavailable. Continue P11 at Sol 6.1 Extra High. Read [P10 evidence](evidence/X2-P10.md).
