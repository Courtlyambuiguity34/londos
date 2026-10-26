# Shop images and management workspaces

Updated 26 October 2026 (Africa/Kampala).

## Put a shop image on the main mall

1. Sign in as the shop owner and open **Shopkeeper → Manage shop**.
2. Open **Products & contacts → Images**. Upload a JPEG, PNG or WebP up to
   4 MiB and give it a useful image description. Wait until processing finishes
   and its thumbnail appears.
3. Open **Design & publish**. Under **Cover image & logo**, select your
   **Shop cover image**. You can also choose a separate **Shop logo**.
4. Select **Save draft**, then **Preview saved draft**. This preview is private.
5. Return to the designer, confirm that you reviewed the saved draft, and select
   **Publish reviewed draft**. Your cover now appears on your public shop card
   and above your shop introduction. The logo appears on the shop itself.
6. Open the mall and your shop link to check the published result. Department
   and product search results use the same shop cover.

Uploading a file adds it to the private image library; it does not automatically
publish that file. If you leave **Shop cover image** unselected, the mall uses a
ready image assigned to a non-archived product in an active department. If
neither exists, a deliberate shop illustration/initial appears instead of a
blank broken-image space. That fallback is not a photo of the merchant’s shop.

Designers can choose ready images already uploaded for their own shop.
Uploading requires catalogue access; publishing retains its separate grant and
recent authentication requirement. Payment approval, publication, tenancy and
moderation remain separate checks. Selecting a cover never overrides them.

## Replace or remove an image

Choose another cover/logo, save, preview and publish it. Until publication,
customers continue seeing the previous published cover. To remove branding,
choose the empty option and publish that saved draft.

An image used by a product or by the current saved/published branding cannot be
deleted. Remove its product assignments and update both the saved and published
design first. Historical revisions remain in the audit trail; restoring one
revalidates its references and cannot revive a deleted image.

Only normalized thumbnail, card and display variants are publicly served.
Original and quarantined uploads remain private. Unpublishing, closing or
restricting a shop blocks subsequent public image requests and discovery,
including old shop aliases. Copies already downloaded by a visitor cannot be
recalled.

## Find your management tools

- **Your shops** lists only assigned shops, their current status and the next
  setup or review step. Summary cards count actual accessible shops, not sample
  views, orders or revenue.
- Inside a shop, use **Products & contacts**, **Design & publish** and
  **Rent & invoices**. Only your permitted sections appear. Account-level
  applications and team access stay separate from individual shop tools.
- On phones, **Home** and the workspace shortcuts stay at the bottom. **More**
  opens the full menu at the top. The same tools remain available on desktop
  through the grouped sidebar.
- Landlord **Today** cards open permitted queues. Tools are grouped into
  shops/tenants, finance, support, growth and administration. Account protection
  and background job details are expandable. No decorative chart invents sales
  or analytics that the system has not recorded.

## Deploy this update

Deploy the current `feature/hosted-lifecycle-secure-2026-10-23` branch using the
existing Render configuration. This change adds no environment variables,
dependencies or database migration. Existing readiness still requires migration
036; follow [Render setup](RENDER-SETUP.md) if upgrading an older database.

Keep the existing worker running, including the embedded worker if that is your
configured setup. If an upload stays in processing, check worker health and the
image’s processing state; retry a failed upload or replace a rejected image.
The designer offers only ready, normalized images from that shop. No Cloudinary,
MongoDB or PostgreSQL credentials are changed by choosing shop branding.

If a picture fails to load, use **Retry image**. A failed image request shows an
accessible fallback. Never enable public access to raw uploads or loosen shop
permissions to troubleshoot a picture.

See [verification and screenshots](evidence/SHOP-IMAGES-AND-WORKSPACES-2026-10-26.md).
