# Londos Component Building Code

The implemented bounded registry is described in [ADR-0014](ADR/0014-bounded-semantic-spaces-and-catalogue-pagination.md); broader SDK examples below remain design policy.

## Purpose

Every public shop component must obey common building standards. Merchants control the interior design; Londos prevents one tenant from creating a dangerous or unusable building.

## Component contract

Each approved component should declare:
- component name/version;
- accepted properties;
- allowed data references;
- responsive behavior;
- accessibility behavior;
- loading strategy;
- maximum content/media bounds;
- analytics events;
- empty/error state;
- deprecation policy.

## Categories

### Identity
ShopHero, ShopLogo, Heading, RichText.

### Catalogue
ProductCard, ProductShelf, CollectionGrid, DepartmentCard, DepartmentRail.

### Media
Image, Gallery, approved VideoEmbed.

### Commerce/contact
ContactPanel, WhatsAppAction, CallAction, EnquiryAction, PickupInfo, DeliveryInfo.

### Trust/information
BusinessHours, LocationCard, VerificationBadge, SocialLinks.

## Platform-owned chrome

Certain UI is not tenant-removable:
- Londos/mall navigation where required;
- shop closure/suspension state;
- safety/report controls where policy requires;
- legal/privacy disclosures;
- sponsored labels;
- system errors/security prompts.

A merchant cannot style their shop to impersonate a Londos system warning, verification badge or another merchant.

## Performance

Components must:
- reserve dimensions to reduce layout shift where practical;
- lazy-load non-critical media;
- request correct responsive image variants;
- avoid unbounded lists;
- avoid tenant-provided blocking scripts;
- respect page-level resource budgets.

## Accessibility

Components should make the safe path the default:
- semantic elements;
- keyboard interaction;
- focus states;
- sufficient contrast;
- accessible labels;
- alt text workflow;
- reduced-motion support;
- usable touch targets.

## External embeds

Default deny. Approve specific providers/types after privacy, security and performance review.

## Animation

Allow bounded presentation effects, not arbitrary code. Respect reduced-motion preferences and performance budgets.

## Versioning

A component update must not silently destroy existing shop layouts.

Possible strategies:
- backwards-compatible renderer;
- component version pinning;
- migration;
- deprecation window.

The LSS validator must know which component versions are valid.

## Designer freedom

Professional designers should get substantial expressive range through composition, tokens, spacing, media, semantic spaces and approved responsive hints.

If demand proves the component catalogue too restrictive, expand the building code safely rather than opening arbitrary execution.
