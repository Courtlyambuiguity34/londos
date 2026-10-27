# Theme extension guide

Each `presets/<id>.json` file supplies one original theme. Copy `atelier.json` to
start. Keep its complete structure and choose a unique lower-case ID matching
the filename, for example `presets/linen-house.json` with `"id":"linen-house"`.

`scripts/generate-shop-themes.mjs` discovers up to 24 definitions, checks file/ID
agreement and writes `registry.generated.ts`. It runs automatically before dev
and production builds. Run `npm run themes:generate` after adding a file if you
want the picker updated in an already running development session. The registry
uses ESM JSON import attributes for Node compatibility and is also bundled by
Next/esbuild. Commit it alongside new preset files.

## Editable design vocabulary

| Property | Supported values |
| --- | --- |
| `layout.hero` | `split`, `cover`, `editorial`, `catalogue`, `mosaic`, `poster` |
| `layout.cards` | `clean`, `framed`, `soft`, `bold` |
| `layout.departments` | `tiles`, `round` |
| `layout.radius` | `soft`, `sharp` |
| `presentation.typography` | `editorial`, `modern`, `classic`, `technical`, `friendly` |
| `presentation.density` | `airy`, `balanced`, `compact` |
| `presentation.contentWidth` | `narrow`, `standard`, `wide` |
| Mobile/desktop product columns | 1–2 / 2–4, using the existing supported numeric values |
| Palette roles | `primary`, `secondary`, `background`, `surface`, `text`, `accent` |

Palette tokens are `cream`, `burgundy`, `gold`, `charcoal`, `white`, `black`,
`stone`, `sand`, `terracotta`, `sage`, `forest`, `navy`, `sky` and `plum`.
The shared presentation schema checks contrast. Prefer merchant photography;
do not add remote stock URLs or fabricate merchant inventory.

Names, descriptions and suggested category are picker metadata. Taglines in a
theme card are illustrative, not copy automatically inserted into a merchant’s
public shop. Theme selection sets visual choices and preserves merchant content.

`catalogue.ts` validates the strict complete shape and supplies selection helpers.
`sections.ts` provides non-mutating duplicate handling and bounded department
starters. Shared presentation validation lives in `shop-design/presentation.ts`;
the old specification exports remain compatible. Styling lives in
`src/app/storefronts.css`, `src/app/editor-workflows.css` and `src/app/design-studio.css`; supported structures
are rendered by the existing canonical shop and `storefront-hero.tsx`.

## Review a theme

1. Run `npm run themes:generate`, then `node scripts/generate-shop-themes.mjs --check`.
2. Run the relevant theme unit cases and a production build.
3. Preview a shop with its own ready imagery, long names, empty content, a
   department and a product at desktop and phone widths.
4. Check contrast, focus, overflow, keyboard access and that overlays do not
   block product links. Verify one main heading per destination.
5. Confirm selection remains a private draft until explicit publication and
   does not alter catalogue/commerce facts or tenant permissions.

A new structural component requires a reviewed renderer/schema addition and
tests. Never use this extension to accept arbitrary provider/merchant code or
weaken authorization. See the [merchant/workflow guide](../../../docs/STOREFRONT-THEMES.md).
