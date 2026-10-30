# Add products and organise your Londos shop

Updated 30 October 2026.

## The three parts of your shop

- **Shop home page:** your welcome message, story, selected products and contact
  details, arranged as sections on one page.
- **Department pages:** groups such as Crops, Seeds or Tools. Customers open a
  department to see its products. Londos creates the page for you.
- **Product pages:** a separate view for each product or service, with its price,
  details, photo and your available contact options.

You do not need to create a page for every product manually. Departments and
products become publicly available through your published shop; unpublished
shops and private previews retain their normal access restrictions.

## Add a department

1. Open your shopkeeper workspace and choose **Products & contacts**.
2. Choose **Add a department**, enter a name such as **Crops**, then choose
   **Create department**.
3. Leave **Department link (optional)** closed unless you want to choose a
   different address. Londos makes a readable address from the name. Duplicate
   addresses within the shop are rejected; no random identifier is appended.

Department names must also be unique within your shop, including archived
departments. Capital letters and extra spaces do not make a different name.
If you already have **Crops**, use that department or choose a genuinely different
name. Any older duplicate names are made distinct automatically, for example
**Crops (2)**, while their products and existing links stay attached.

An archived department is hidden and cannot receive new products. In
**Departments**, choose **Activate Crops** to use it again. The active/archived
count explains which departments are available in the product selector.

Raw ordering numbers are no longer shown in the normal form. Existing order
values are preserved when editing; new departments follow the existing ones.
Use **Move up/down** beside an active department to change department order.
Use the page builder's separate move controls to arrange home-page sections.

## Add a product in three steps

Choose **Add product** in your shop header, **Add a product** in the catalogue,
or **Add product to Crops** beside that department. These open the focused setup:

1. **Photo & name:** enter a name and take or choose a JPEG, PNG or WebP photo
   up to 4 MiB. Londos uploads, prepares and selects it automatically. An existing
   image can be selected under **Choose from your uploaded photos**. Wait for
   **Photo ready and selected for this product** before continuing.
2. **Details:** choose a department, currency and optional price. You can create
   a department here without losing the product details. Enter **5000** for
   UGX 5,000 or **19.95** for USD 19.95; leave blank for **Ask for price**.
   Description and a custom product link are under **More details (optional)**.
3. **Review & save:** check the price, department and photo. Choose availability,
   then **Save product**. The shop's publication status still controls public access.

A physical product needs a ready photo to be made visible through this setup.
Choose **Add the photo later**, then **Save hidden for later** to keep an unfinished
listing private. Add its photo later, uncheck **Keep this listing hidden for now**
and save when it is ready. Photos remain optional for services.

After saving, choose **Add another product** to keep the same department,
currency and product/service type while starting with an empty name and photo.
Your shop overview lists missing product photos with direct **Add a photo** links.
Department thumbnails come from their products: add a photographed product to
the department rather than looking for a separate department-image field.

An upload failure leaves your typed details in place. A slow photo offers
**Check photo again**. A browser reload/close or leaving the guided editor warns
about unsaved changes; entered details are not stored as persistent drafts until
saved. Uploaded photos remain in Images.

## Full catalogue editor and duplication

**Products & contacts → Products** retains the full editor for existing and
advanced workflows. **Open full editor for Crops** selects that department.
Choose **Edit** beside an item to change it, or use **Add a photo** to open the
focused setup. This full editor also supports **Save & add another** and
**Duplicate**. Duplicate prepares an unsaved hidden copy; review its name,
price, photo and availability before saving. The original stays unchanged.

The full editor retains its separate Images tab and existing-photo selection.
It displays missing-photo notices, but existing advanced catalogue writes can
still save a product without a photo. **Review & publish** shows remaining
product and department photo gaps. Add the photos or explicitly acknowledge
those gaps before publication. This preserves deliberate text-only catalogues
without silently treating missing photos as complete.

## Find and arrange products

Use **Find a product**, **In department** and **Listing status** above the product
list, then choose **Find products**. The search covers the whole catalogue and
keeps the same filters when moving between pages. **Clear product filters**
returns to the full list without clearing the product form.

To arrange products, choose one active department and clear the name/status
filters. **Move up/down** beside a non-hidden product changes its order within
that department, including across catalogue pages. Hidden and deleted items are
not rearranged. These order changes save immediately and affect published
department pages and department-based displays. Products explicitly selected in
a home-page section keep the order chosen in **Design & publish**.

## Delete, recover or revert a change

- Choose **Delete** beside a product or department and confirm. It disappears
  from your catalogue and public shop immediately. Deleting a department also
  deletes the products currently inside it.
- Open **Products & contacts → History & deleted items** to see deleted items
  and their restore deadlines. Choose **Restore** within **30 days**. Restoring
  a department brings back the products deleted with it; products you deleted
  separately before that stay deleted. Restore and activate a department before
  trying to restore an individual product inside it.
- Under **Recent changes**, expand an edit to compare the previous and new
  values. **Revert this change** restores the values from before that edit as a
  new saved version. It replaces the current values for that item, so review the
  comparison and confirmation first. History starts with this feature; earlier
  versions cannot be reconstructed.
- Another department may have taken a deleted department's name. A previous edit's
  link may also be in use. Resolve the conflict before restoring. Recovery checks permissions, current
  versions, limits and required photos; a failed recovery makes no partial changes.

Both deletion recovery and edit reversion expire after 30 days. Archived items
are different from deleted items: activate an archived department from the
Departments tab. Restores and reverts may appear immediately in a published shop.
Maintenance removes expired recovery details; minimal non-public identity records
remain where needed to preserve customer-request and financial references.

See [catalogue recovery verification](evidence/CATALOGUE-RECOVERY-2026-10-27.md)
for the deployment migration and tested safeguards.

## Arrange the home page

1. Open **Design & publish → Sections**.
2. Under **What would you like to add?**, choose a plain-language section such as
   **Welcome message**, **Welcome banner**, **Our story**, **Department preview**,
   **Product collection**, **Contact details** or **How to buy**.
3. Enter the heading/text or choose the department/products that belong there.
   A welcome, story or contact section remains part of the home page. A department
   preview includes a link to its full department page; products have their own
   detail links.
4. Expand a section to edit it. Department previews let you change the department
   and choose **Show up to … products**. Rich sections offer named layouts such
   as **Side by side**, **Neat rows** and **Swipeable row**.
5. Use **Move … up/down** to arrange the home page, then **Save draft**.
6. A saved department section offers **Preview … page**. This opens the private
   saved department page, preserving the draft revision. Unsaved changes must be
   saved first. You can also preview the whole saved shop.
7. In **Review & publish**, review and confirm publication. Saving a draft alone
   does not replace the public design.

In **Style**, phone/computer product arrangements use descriptions such as
**One large product per row** or **Three products side by side**. Choose spacing
and shop appearance by name rather than raw internal values. Product-management
shortcuts are shown only when your account has the required catalogue access.

Custom standalone merchant pages beyond the existing department/product pages
are not introduced by this update. The existing section, product-card and access
limits remain. See [verification and changed files](evidence/MERCHANT-CLARITY-2026-10-27.md).

## Apply for a new shop

Open **Apply for a shop**, complete the business details, add one private
verification photo (JPEG, PNG or WebP, up to 2 MiB), accept the policies and choose
**Send for review**. The form saves the application, uploads the photo and submits
it for review. **Create application draft** lets you finish later. If the photo
upload fails after the details save, use **Continue your saved application**;
you do not need to create another application.

Verification photos are private and are separate from public product photos.
Review and verified rent coverage still precede shop provisioning. After those
steps, the shop workspace guides you through products, contacts, design and
publication. No fixed approval or setup duration is promised.
