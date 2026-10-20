# Londos logo assets

The approved [concept board](londos-logo-concept.png) is implemented as individual
image assets. The header and footer now display an actual image logo, with an
accessible “Londos home” link name. The prior session/membership checks controlling
the Shopkeeper navigation link remain unchanged.

| Asset                                                                | Use                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Light-surface logo](../../public/brand/londos-logo.png)             | Transparent 1200 × 400 PNG used by the header and footer           |
| [Dark-surface logo](../../public/brand/londos-logo-dark.png)         | Ivory/terracotta logo on an opaque green background, 1200 × 400    |
| [Symbol](../../public/brand/londos-mark.png)                         | Transparent 1024 × 1024 PNG for standalone branding                |
| [192 px app icon](../../public/brand/app-icon-192.png)               | Regular PWA icon                                                   |
| [512 px app icon](../../public/brand/app-icon-512.png)               | Large PWA/store image                                              |
| [512 px maskable icon](../../public/brand/app-icon-maskable-512.png) | Extra safe space for Android/other platform cropping               |
| [Apple icon](../../public/brand/apple-touch-icon.png)                | 180 × 180 opaque home-screen icon                                  |
| [Browser icon](../../public/brand/favicon-64.png)                    | 64 × 64; also installed at `src/app/icon.png` for Next.js metadata |
| [Downloadable pack](../../public/brand/londos-brand-assets.zip)      | Individual ready-to-use PNG files in one archive                   |

Mall, Shopkeeper and Management keep distinct PWA IDs, names and start routes,
with the same Londos symbol. These icons do not confer account permissions.
The previous `/pwa/icon-192.png`, `/pwa/icon-512.png` and `/pwa/londos-icon.svg`
URLs also resolve to the new artwork for older clients. The SVG compatibility
file embeds a PNG; these generated assets are **raster artwork, not vector paths**.

The green, ivory and terracotta identity follows the approved concept. A full
logo is used at website sizes; small app/browser icons use the symbol without
illegibly small lettering. Original generated masters live in `brand-masters/`.
Regenerate the optimized PNG exports with `node scripts/build-brand-assets.mjs`
after installing the locked dependencies. No online image service is needed to
run or build Londos; the assets ship inside the standalone/Docker artifact.

Deploy the commit containing these assets on Render to update the website.
Installed PWA and browser icons may remain cached by the operating system;
close/reopen or reinstall the PWA if its old icon remains after deployment.
The logo change does not alter deployment readiness, account roles or billing.

## Verification — 20 October 2026

- `npm run build`: production web compilation, TypeScript checks and worker packaging passed.
- `npm test -- tests/unit/pwa.test.ts`: 2 passed, before and after the asset changes.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --grep 'website logos|primary pages|keyboard users'`: final run 6 passed across desktop/mobile.
- Browser checks decoded both logo images, fetched the browser and Apple icons, and verified
  actual PNG dimensions for every icon in all three PWA manifests. No horizontal overflow
  at 320, 390, 768 or 1280 pixels. Existing automated WCAG and keyboard checks passed.
- The initial asset test was corrected to scroll the lazy-loaded footer into view before
  waiting for image decoding. It then found a real missing favicon metadata link, which
  was fixed with explicit icon metadata before the successful final run.
- Pixel check: the maskable icon is opaque and its light/terracotta mark remains inside
  the central 80%-diameter safe circle. The download ZIP passed its integrity check.
- Targeted ESLint, formatting, documentation links and `git diff --check` passed.

Visual checks: [desktop](brand-preview-desktop.png) and [mobile](brand-preview-mobile.png).
These screenshots use labeled local fixtures, not a live Render/Aiven session.
No production deployment, provider call, database change or account change was made.
