# Search & Discovery Ranking Principles

## Purpose

Londos search is a mall directory, not an auction where the richest tenant automatically owns the corridor.

## Organic ranking objectives

A useful result should balance signals such as:
- query relevance;
- category match;
- product/service availability;
- merchant/shop quality signals;
- freshness;
- customer location when explicitly relevant/available;
- engagement signals resistant to manipulation;
- verification/trust where policy justifies it.

Exact weights are an experiment, not a constitutional rule.

## Shop identity

Product matches help retrieve/rank **shops**.

A result can show matching products, but the destination remains a merchant shop context.

Example:

```text
Query: running shoes

Annette Sports
  Matching: 8 running shoes
  From UGX ...
  → Enter running-shoes section in Annette Sports
```

## Diversity

One tenant should not fill an entire result page merely by uploading hundreds of near-identical listings.

Possible controls:
- shop-level aggregation;
- result caps;
- duplicate detection;
- catalogue-quality signals;
- spam penalties.

## Internal mall neutrality

`mall_id` is an operational partition. Organic ranking must not prefer Mall 1 merely because it was created first.

## Paid promotion

If introduced:
- label it clearly as sponsored/promoted;
- maintain relevance/safety eligibility;
- separate sponsored selection from organic ranking;
- cap ad density;
- measure whether promotion damages customer trust.

## Cold start

New legitimate shops need a fair opportunity to be discovered even without historical engagement.

Possible inputs:
- textual/category relevance;
- completeness;
- availability;
- verification;
- freshness;
- exploration allocation.

Do not create a permanent rich-get-richer loop.

## Local language and typo handling

Londos should eventually support the language/query patterns customers actually use, including spelling variation and mixed-language queries. Pilot search logs should guide which languages and synonym dictionaries matter first.

## Abuse

Watch for:
- keyword stuffing;
- fake products;
- misleading prices;
- duplicate listings;
- fake engagement;
- category manipulation;
- bait-and-switch availability.

Search enforcement should connect to moderation.

## Search quality metrics

Track:
- zero-result rate;
- search latency;
- result click-through;
- reformulation rate;
- search → shop entry;
- search → merchant contact;
- abandonment;
- diversity;
- report rate after search;
- new-shop exposure.

Search success is not merely “returned 20 rows.”
