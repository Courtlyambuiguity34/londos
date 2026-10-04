# Unit Economics & Rent Stress Test

## Why this matters

Londos can be technically excellent and still fail if the rent cannot fund the cost of acquiring, verifying, supporting, storing, serving and moderating each tenant.

The working entry-price hypothesis is **UGX 5,000/month**.

## Gross rent scenarios

Ignoring taxes, payment fees, discounts, arrears and churn:

| Paying shops | Gross monthly rent |
|---:|---:|
| 20 | UGX 100,000 |
| 100 | UGX 500,000 |
| 500 | UGX 2,500,000 |
| 1,000 | UGX 5,000,000 |
| 1,500 | UGX 7,500,000 |
| 5,000 | UGX 25,000,000 |
| 10,000 | UGX 50,000,000 |
| 20,000 | UGX 100,000,000 |

This is **revenue, not profit**.

## Cost buckets per merchant

Measure rather than guess:
- payment collection/reconciliation;
- identity/business verification;
- support time;
- moderation/fraud handling;
- database;
- media storage;
- CDN/bandwidth;
- image/video processing;
- search indexing/queries;
- notifications;
- backups;
- observability;
- AI shop-design usage;
- customer acquisition/merchant acquisition;
- taxes/legal/compliance;
- failed-payment/churn overhead.

## Critical insight

At UGX 5,000/month, Londos cannot behave like an agency manually building and supporting a website for every merchant.

Self-service and automation are economic requirements, not merely UX preferences.

## Contribution model

For each active paying shop:

```text
Monthly contribution
= collected rent
- payment collection cost
- variable infrastructure cost
- variable support/moderation cost
- variable AI/media/search cost
```

Then:

```text
Operating surplus
= total contribution
- fixed infrastructure
- staff
- sales/marketing
- legal/admin
- other overhead
```

## Pilot measurements

For every pilot merchant record:
- onboarding minutes;
- verification minutes;
- support minutes/month;
- number of support contacts;
- storage bytes;
- transformed-media bytes;
- CDN bandwidth;
- search/index activity;
- AI design calls/tokens/cost;
- moderation incidents;
- rent collection cost;
- acquisition source/cost;
- whether merchant would renew;
- whether merchant actually renews.

## Pricing principle

Do not make storage-heavy/showroom merchants cross-subsidize unlimited resource use indefinitely.

Possible future rent dimensions:
- catalogue size;
- media/storage allowance;
- advanced showroom media;
- traffic/bandwidth above generous fair-use;
- additional staff/admin features;
- optional promotional services.

These should still feel like renting different commercial space/capabilities, not arbitrary SaaS packaging.

## Break-even question

Before scaling acquisition, Londos must be able to answer:

> For every UGX 5,000 collected from the typical small shop, how much remains after the costs that increase because that shop exists?

If the answer is negative, change automation, included resources, collection method or rent before pursuing volume.
