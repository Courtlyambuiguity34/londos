# Design a shop with Londos

Updated 27 October 2026 (Africa/Kampala).

Start at **Shopkeeper → Manage shop → Design & publish → Describe a change with
the design assistant**. You need design access and recent authentication. The
assistant prepares proposals; it does not publish or edit your catalogue facts.

## Start with a useful brief

Describe the mood, colours, arrangement and sections you want. You can use a
starting-point button, choose a named theme or write your own instruction.
Examples that work locally, without a provider call:

- `Create a nature-inspired storefront`
- `Create a modern storefront`
- `Create a premium dark storefront`
- `Use Mosaic theme` (or any installed theme)
- `Use blue theme` (the classic style, replacing conflicting named styling)
- `Set announcement to "Our new collection is here"`
- `Remove the call button`
- `Move Shoes before Handbags` when those department sections exist in the design.

Local directions use actual merchant names, introductions and current catalogue
references. They retain existing sections and text, adding a hero, product
collection and shop-information section only where appropriate and within the
page budget. No products, prices, stock, delivery promises or reviews are invented.

The assistant **does not browse or import websites**. If you paste only a reference
URL, it asks for a usable direction rather than spending a provider request
pretending to inspect the site. Describe what you like about its colours,
typography or layout, or supply text you want to use. Answering a design question
fills the brief; you still choose **Propose design change**.

Broader conversational requests need a configured remote provider and the
external-processing permission checkbox. Only the bounded authorised design and
catalogue labels are sent. Do not put private documents or credentials in a brief.

## Preview, compare and apply

1. Submit your brief. You can cancel a running request. Reloading the assistant
   while it runs resumes status checks; a dropped submission response is
   reconciled with its original request key.
2. Review the change list. If the assistant needs an answer, resolve that in a new
   request. A blocking question cannot be applied.
3. Choose **Preview here**. Switch between **Proposal** and **Saved draft** when
   a saved revision exists. The canvas uses an actual **1100px desktop** or
   **390px phone** viewport and scales it to fit your available screen.
4. Explore the private catalogue links in the preview, or open the full preview
   for a larger view. Proposal previews remain tied to the requesting account,
   current design/catalogue and proposal expiry.
5. Confirm that you previewed the proposal. If an independent review could not
   complete or raised a warning, acknowledge that separately before applying.
6. Choose **Apply reviewed proposal as draft**. The previous published revision
   stays public. Follow **Review your saved draft** to edit further, preview and
   explicitly publish in the manual editor.

The private preview endpoints permit embedding only by the same origin. All
other pages retain their existing frame denial. Preview requests still require
normal authentication, permissions and freshness and remain private/no-store.

## Themes and sections

There are ten original themes. **Mosaic**, **Nocturne**, **Botanica** and **Folio**
join Atelier, Terrain, Harvest, Signal, Studio and Pulse. See the
[theme guide](STOREFRONT-THEMES.md) and [extension vocabulary](../src/modules/shop-themes/README.md).
A new preset still lives in one reviewed JSON file; build/dev regenerate its
registry automatically.

In **Sections**, expand a rich section and change **Section layout**. Hero,
featured product, product collection, department editorial and shop-information
sections expose their supported variants. You can also add a hero, a rich product
collection or shop-information panel directly. Edit text, reorder or remove
sections, then save and preview before publishing. Existing assignments remain
intact unless explicitly changed through their supported controls.

An explicit designed hero appears before the automatic collection tiles. The
shop identity becomes a compact heading rather than a second full hero. Story,
offer, gallery, product and contact sections use consistent spacing and themed
surfaces in both private and public views. Secondary panels choose readable
foreground colours, including dark themes.

## Provider review and troubleshooting

A valid primary proposal is retained when optional independent review fails
because of authentication, an outage, timeout or quota. It carries an explicit
warning and cannot be applied until you acknowledge it. Invalid reviewer content,
cancelled requests, lost authority and changed references still fail closed.

- **Provider unavailable/authentication:** ask mall management to check the key,
  project access, chosen model and existing AI configuration. A configured key
  is not proof of working API access. Local directions and manual design remain
  available.
- **Working on a proposal:** status checks run independently of the submission
  connection. Use **Cancel request** or **Reload design assistant** if needed.
- **Sign in again / security check:** complete fresh authentication and return.
  Requests are not allowed to bypass this requirement.
- **Changed catalogue or draft:** reload and request a new proposal against the
  current design. A stale candidate is not silently merged or published.
- **Daily allowance:** the existing 20 requests/shop/UTC day, one active request
  per shop, conservative token reservation and configured money cap still apply.
  Local directions count toward the request allowance. Admitted usage is not
  refunded by cancellation.

The provider output allowance is now 4,096 tokens, with a bounded 24,000-byte
wire intent. The canonical design and intent budgets remain enforced. Reservations
use the higher allowance; the configured daily spending ceiling is unchanged.
Provider and total deadlines remain eight and thirty seconds, with a forty-second
lease and fifteen-minute proposal expiry.

Provider availability and recorded usage are in a collapsible section of the
assistant. Missing usage is unmeasured, not proof of zero cost. Checked against
fictional data in this execution environment on 27 October 2026: Gemini completed
a theme check and a richer theme-plus-collection contract; OpenAI rejected
authentication/access. This does not establish the current state of your Render
keys or delivery of arbitrary designs.

Maintainer checks (these make real requests if credentials are configured):

```sh
npm run ai:verify -- --provider=gemini --studio --require-live
npm run ai:verify -- --provider=openai --require-live
```

Never paste real keys or provider response bodies into issue reports. Preserve a
support reference and safe failure code instead. See the
[verification and changed-file record](evidence/DESIGN-STUDIO-2026-10-27.md).
