# Product & UX Model

## Mental model

Londos is a **mall**, merchants are **tenants/shopkeepers**, and Londos operations are the **landlord**. This vocabulary is not decorative; it guides product behavior.

## Customer journey

A customer may arrive through:
- the Londos entrance;
- category/department discovery;
- search;
- a direct merchant shop link;
- a shared product/deep link.

No customer account is required simply to enter or browse.

### Search-to-shop journey

```text
Search “shoes”
→ relevant shops containing shoes
→ choose Annette Fashion House
→ enter Annette's shoes context
→ inspect shoes
→ continue browsing Annette's dresses/handbags/etc.
→ use Annette's enabled contact/commerce method
```

This deliberately preserves cross-selling inside the merchant's premises.

## Merchant journey

```text
Apply for space
→ provide required business information
→ review / verification
→ approval
→ pay rent
→ receive immutable shop identity
→ design premises
→ add departments/products/services
→ configure contact, commerce and delivery
→ publish
→ share direct shop link
→ receive discovery traffic
→ manage enquiries/catalogue
→ view analytics
→ renew tenancy
```

## Shop design

Primary interaction: conversational design. Merchants describe the desired shop in ordinary language. The design system maps requests into a validated structured schema.

Examples:
- “Put new arrivals at the entrance.”
- “Move shoes before handbags.”
- “Make dresses the first department.”
- “Remove the call button.”
- “Use a more elegant boutique style.”

Alternative paths:
- start from a category-specific design;
- hire a recommended professional designer;
- advanced designer workflow through a constrained SDK.

## Merchant autonomy

A tenant controls, within mall rules:
- branding and shop identity;
- departments;
- catalogue;
- pricing;
- media;
- contact methods;
- payment instructions/methods;
- delivery/pickup terms;
- promotions;
- shop layout/design.

The landlord controls shared-building rules:
- prohibited goods/services;
- impersonation;
- fraud/scams;
- safety;
- platform abuse;
- technical limits;
- privacy/security requirements;
- verification requirements;
- suspension/closure processes.

## Rent model

Working hypothesis: very low recurring rent, initially discussed around **UGX 5,000/month** for a small merchant offering. This is a hypothesis to validate, not final pricing.

Potential rent differentiation should relate naturally to commercial space/resource use—catalogue/media/storage/showroom needs—rather than exposing SaaS jargon such as “Basic / Pro / Enterprise” to shoppers.

## Arrears

Expected process:
1. renewal reminder;
2. due notice;
3. grace period;
4. optional payment arrangement where policy allows;
5. temporary closure/suspension if unresolved;
6. retain shop data for a defined period;
7. reopen after valid renewal where eligible.

Exact durations require business-policy decisions.

## Public language

Customers should see the merchant's identity, not internal tier names, tenant IDs, database partitions, or “admin” terminology.

Merchants should feel they **rent and control a shop in Londos**, not that they purchased a generic website-builder subscription.
