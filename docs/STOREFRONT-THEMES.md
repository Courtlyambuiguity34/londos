# Storefront themes and focused editing

Updated 27 October 2026 (Africa/Kampala).

Londos now has ten original visual directions. The supplied retail references
informed image hierarchy, collection browsing and editing workflows; their
brand artwork, stock photographs and commercial theme files were not copied.

| Theme | Direction | Main composition |
| --- | --- | --- |
| Atelier | Editorial boutique, fashion and home | Elegant type, split imagery and clean product cards. |
| Terrain | Outdoor, equipment and lifestyle | Full-image entrance, strong headline and framed cards. |
| Harvest | Produce and everyday goods | Warm split entrance, soft cards and round collection tiles. |
| Signal | Electronics and specialist retail | Product-first entrance, precise type and a denser desktop grid. |
| Studio | Services, beauty and creative businesses | Reversed editorial composition and a softer surface. |
| Pulse | Statement clothing and lifestyle | Bold image entrance, uppercase headline and graphic card borders. |
| Mosaic | Home, lifestyle and considered objects | A three-image collage, airy grid and warm gallery rhythm. |
| Nocturne | Beauty, jewellery and luxury | Dark canvas, cinematic cover and luminous framed product cards. |
| Botanica | Produce, agriculture and natural goods | Open poster entrance, forest accents and round collection tiles. |
| Folio | Independent services and portfolios | A focused narrow canvas, editorial imagery and a two-column desktop catalogue. |

These are starting points, not restrictions on a merchant’s category. The theme
picker can show all themes or filter by their suggested category. Your own
photography, writing and catalogue determine the finished result. Empty shops
do not receive invented products, prices, testimonials, offers or analytics.

## Design your shop

1. Sign in and open **Manage shop → Design & publish**.
2. In **Themes**, choose a visual direction. This changes only the unsaved draft.
   It keeps your shop name, announcement, uploaded images, sections and contact
   actions. It never changes products, prices, stock, rent, payment details or
   publication status.
3. In **Branding**, select a ready cover/logo and write your announcement. Upload
   missing images from **Products & contacts → Images** if you have catalogue
   access. See [the image guide](SHOP-APPEARANCE.md).
4. In **Sections**, edit your page content, expand a rich section to change its layout variant and text,
   or move it up/down. A department layout gives customers a clear way to browse
   your current catalogue. Replacing a nonempty layout asks for confirmation.
5. In **Style**, adjust typography, colours, spacing and product columns. The
   classic colour presets remain available; choosing one resets the selected
   theme/presentation styling while retaining content. **Use my own layout
   styling** in the theme library removes the named layout but retains your
   current presentation values for further editing.
6. Use **Save draft** and **Preview saved draft**. Check the whole shop, a
   department and a product on both a phone and a larger screen.
7. In **Review & publish**, confirm the saved draft and publish it. This retains
   the existing fresh-authentication and publish-permission requirements. The
   previous published theme stays public until this action succeeds.

Unsaved input stays mounted when switching panels. Validation still runs before
saving. Draft and published versions remain distinct and use the existing
immutable revision history. Restoring an older revision creates a new draft,
revalidates references and requires separate publication.

The existing design assistant also recognizes commands such as **Use Harvest
theme** and **Use Atelier theme** through the bounded local compiler. Those exact
commands need no remote provider call. Other AI design requests retain their
existing consent, provider configuration, budget, private preview and explicit
apply/publication rules. A model cannot install code or publish directly.

## Catalogue and landlord forms

**Products & contacts** has separate Products, Departments, Images, Contact
settings and Customer requests panels. A direct `#images` or `#contacts` link
opens the correct panel. Keyboard arrow keys/Home/End move between tabs. Field
values stay in place while switching panels; leaving or reloading the page
still needs care with unsaved work.

Labels stay with their controls in desktop field groups; narrow screens use a
single column. Creating/updating records still uses the same validated APIs,
version checks, confirmation prompts and success/failure feedback.

Landlord **Communications & promotions** separates payment/support details,
email campaigns and promotions. Switching panels neither sends a message nor
activates an offer. The existing explicit actions, audience confirmation,
verified ledger workflow and Brevo delivery limits remain in force.

## Repeated introductions and catalogue visibility

The old editor prefilled the same welcome text for every new narrative section.
New sections now start with empty, labelled fields. Adding an exact duplicate is
rejected with an explanation. Existing saved duplicates render once; their
stored history is not rewritten. **Remove repeated sections from draft** makes
cleanup an explicit, reviewable edit.

A published design containing only a narrative now also shows its bounded,
current owned catalogue. Collection tiles link to the full departments, so a
homepage card budget does not make later products unreachable. Archived items,
archived departments, unpublished/restricted shops and private image sources
retain their existing eligibility boundaries. Product detail pages have one
main heading and a dedicated image/information layout.

## Preview changes with the design assistant

Open **Design & publish → Describe a change with the design assistant**. Named
themes and local directions such as “Create a nature-inspired storefront” can
prepare a design from your existing catalogue without a provider call. Use
**Preview here** to compare a proposal and saved draft at a real 1100px desktop
or 390px phone viewport, scaled to the available editor space. Applying still
requires your confirmation and saves a draft; publish separately in the editor.
See the [design studio guide](DESIGN-STUDIO.md) for reference briefs, recovery,
independent reviews and provider diagnostics.

## Add another theme as one file

Theme definitions live in
`src/modules/shop-themes/presets/`. See the colocated
[theme extension guide](../src/modules/shop-themes/README.md).

Copy one preset to a new JSON file, give it a unique matching `id`, and edit its
reviewed layout/palette/type tokens. Run `npm run themes:generate` for immediate
local use. `npm run dev` and `npm run build` regenerate discovery automatically;
there is no second hand-maintained theme list. Commit the new JSON and generated
registry together. Unsupported keys, layout values and inaccessible palettes
fail validation.

The extension accepts reviewed data, not arbitrary uploaded HTML, CSS or scripts.
A genuinely new component/layout behavior belongs in the trusted renderer with
verification; adding a new combination of the supported design choices needs
only its preset file. Do not delete a theme still used by shops: keep its stable
ID while retiring it or move affected shops through reviewed draft/publication
changes. An unknown stored ID falls back to the normal renderer without erasing
its content, but cannot be saved again until a supported theme/custom styling is
chosen.

## Deploy

Deploy the updated hosted branch using the existing configuration. There are no
new credentials, environment variables, services, packages or SQL migrations.
The existing migration036 readiness requirement remains. The frontend and
independent worker build include the reviewed theme definitions. No deployed
shop is automatically published, renamed or reassigned by installing this update.
