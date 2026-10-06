import Link from "next/link";
import { renderPilotContext } from "@/server/analytics";
import { PilotObserver } from "./pilot-observer";
import type { CaptureInput } from "@/modules/analytics/contract";
import type { ShopView, PublicProduct } from "@/server/public-shop";
import { formatMinorMoney } from "@/modules/money";
import { ReadyImage } from "./ready-image";
import { EmptyState } from "./empty-state";
import { SearchForm } from "./search-form";
import { spaceProducts } from "@/modules/shop-design/specification";

export function CanonicalProduct({
  product,
  view,
  large = false,
}: {
  product: PublicProduct;
  view: ShopView;
  large?: boolean;
}) {
  return (
    <article className="product-card canonical-product">
      {product.media_id && product.alt && product.width && product.height ? (
        <ReadyImage
          shopId={view.shop.id}
          assetId={product.media_id}
          alt={product.alt}
          width={product.width}
          height={product.height}
          privatePreview={view.privatePreview}
          large={large}
        />
      ) : (
        <div className="image-placeholder" role="img" aria-label={`No image for ${product.name}`}>
          Image coming soon
        </div>
      )}
      {large ? (
        <h1>{product.name}</h1>
      ) : (
        <h3>
          <Link prefetch={false} href={`/shops/${view.shop.slug}/products/${product.slug}`}>
            {product.name}
          </Link>
        </h3>
      )}
      <p>{formatMinorMoney(product.price_minor, product.currency)}</p>
      <p>
        {product.availability === "available"
          ? product.kind === "service"
            ? "Service available"
            : "Available"
          : "Currently unavailable"}
      </p>
      {large ? <p>{product.description}</p> : null}
    </article>
  );
}
function Contacts({ view }: { view: ShopView }) {
  const c = view.contact;
  if (!c) return <p>Contact details will appear when the shop provides them.</p>;
  const enabled = (action: (typeof view.specification.actions)[number]) =>
    view.specification.actions.includes(action);
  return (
    <div className="canonical-contacts">
      <div className="button-row">
        {enabled("call") && c.phone ? (
          <a className="button" href={`tel:${c.phone}`} data-pilot-contact="call">
            Call shop
          </a>
        ) : null}
        {enabled("whatsapp") && c.whatsapp ? (
          <a
            className="button"
            href={`https://wa.me/${c.whatsapp.slice(1)}`}
            data-pilot-contact="whatsapp"
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp shop
          </a>
        ) : null}
        {enabled("enquiry") && c.enquiries_enabled && !view.privatePreview ? (
          <Link
            prefetch={false}
            className="button button--outline"
            href={`/contact/${view.shop.id}`}
            data-pilot-contact="enquiry"
          >
            Enquire with the shop
          </Link>
        ) : null}
        {c.website ? (
          <a
            href={c.website}
            data-pilot-contact="website"
            target="_blank"
            rel="noopener noreferrer"
          >
            Merchant website
          </a>
        ) : null}
      </div>
      {c.delivery_instructions ? <p>{c.delivery_instructions}</p> : null}
      {c.payment_instructions ? <p>{c.payment_instructions}</p> : null}
      <p>
        Agree purchases and payment directly with the merchant. An enquiry is not a confirmed order.
      </p>
    </div>
  );
}
export function CanonicalShop({ view, proposal = false }: { view: ShopView; proposal?: boolean }) {
  const c = view.contact,
    actions = view.specification.actions;
  const channels: NonNullable<CaptureInput["channel"]>[] = [];
  if (c?.phone && actions.includes("call")) channels.push("call");
  if (c?.whatsapp && actions.includes("whatsapp")) channels.push("whatsapp");
  if (c?.enquiries_enabled && actions.includes("enquiry")) channels.push("enquiry");
  if (c?.website) channels.push("website");
  return (
    <PilotObserver
      capture={
        view.privatePreview
          ? null
          : renderPilotContext({
              page: view.selectedProduct
                ? "product"
                : view.selectedDepartment
                  ? "department"
                  : "shop",
              shopId: view.shop.id,
              departmentId: view.selectedDepartment?.id ?? null,
              productId: view.selectedProduct?.id ?? null,
              shops: [],
              resultCount: 0,
              globalDiscovery: false,
              channels,
            })
      }
    >
      <div className={`shell shop-page canonical-shop theme-${view.specification.theme}`}>
        {view.privatePreview ? (
          <aside className="notice" aria-label="Private preview">
            {proposal ? (
              "Private proposal preview · Not saved. Applying creates a draft; publication requires a separate confirmation."
            ) : (
              <>
                Private design preview · Revision {view.revision}. Publication requires a separate
                confirmation.
              </>
            )}
          </aside>
        ) : null}
        <nav aria-label="Shop navigation" className="filter-chips">
          <Link prefetch={false} href="/">
            The mall
          </Link>
          <Link prefetch={false} href={`/shops/${view.shop.slug}`}>
            Whole shop
          </Link>
          {view.departments.map((d) => (
            <Link
              prefetch={false}
              key={d.id}
              href={`/shops/${view.shop.slug}/departments/${d.slug}`}
            >
              {d.name}
            </Link>
          ))}
        </nav>
        {!view.selectedProduct ? (
          <header className="canonical-heading">
            <p className="eyebrow">Independent shop</p>
            <h1>{view.shop.name}</h1>
            <p>{view.shop.tagline}</p>
            <p>{view.specification.announcement}</p>
          </header>
        ) : null}
        {!view.privatePreview ? <SearchForm shopId={view.shop.id} maxLength={80} /> : null}
        {view.applicationReviewed ? (
          <p className="notice">
            Development application reviewed. This fictional local review does not guarantee
            identity, products or payments.
          </p>
        ) : null}
        {view.missingDestination ? (
          <EmptyState
            title="This item has moved or is unavailable."
            description="Explore the shop's current departments and products."
            href={`/shops/${view.shop.slug}`}
            action="Browse the whole shop"
          />
        ) : view.selectedProduct ? (
          <section className="shop-content-section">
            <p className="eyebrow">{view.shop.name}</p>
            <CanonicalProduct product={view.selectedProduct} view={view} large />
            <Contacts view={view} />
          </section>
        ) : view.selectedDepartment ? (
          <section className="shop-content-section">
            <h2>{view.selectedDepartment.name}</h2>
            <div className="product-grid">
              {view.products.map((product) => (
                <CanonicalProduct key={product.id} product={product} view={view} />
              ))}
            </div>
            {!view.products.length ? <p>New pieces will appear here soon.</p> : null}
            <nav aria-label="Catalogue pages" className="button-row">
              {view.paginated ? (
                <Link
                  prefetch={false}
                  href={`/shops/${view.shop.slug}/departments/${view.selectedDepartment.slug}`}
                >
                  First page
                </Link>
              ) : null}
              {view.nextCursor ? (
                <Link
                  prefetch={false}
                  href={`/shops/${view.shop.slug}/departments/${view.selectedDepartment.slug}?after=${view.nextCursor}`}
                >
                  Next products
                </Link>
              ) : null}
            </nav>
          </section>
        ) : (
          view.specification.spaces.map((space) => {
            if ("body" in space)
              return (
                <section key={space.id} id={space.id} className="shop-content-section">
                  <h2>{space.title}</h2>
                  <p>{space.body}</p>
                  {space.type === "service_desk" ? <Contacts view={view} /> : null}
                </section>
              );
            if (space.type === "contact")
              return (
                <section key={space.id} id={space.id} className="shop-content-section">
                  <h2>Contact this shop</h2>
                  <Contacts view={view} />
                </section>
              );
            const department =
              "departmentId" in space
                ? view.departments.find((d) => d.id === space.departmentId)
                : null;
            const products = spaceProducts(space, view.products);
            if ("departmentId" in space && !department) return null;
            return (
              <section key={space.id} id={space.id} className="shop-content-section">
                <h2>{"title" in space ? space.title : department?.name}</h2>
                <div className="product-grid">
                  {products.map((product) =>
                    space.type === "gallery" ? (
                      <figure key={product.id}>
                        {product.media_id && product.alt && product.width && product.height ? (
                          <ReadyImage
                            shopId={view.shop.id}
                            assetId={product.media_id}
                            alt={product.alt}
                            width={product.width}
                            height={product.height}
                            privatePreview={view.privatePreview}
                          />
                        ) : (
                          <p>Image currently unavailable</p>
                        )}
                        <figcaption>
                          <Link
                            prefetch={false}
                            href={`/shops/${view.shop.slug}/products/${product.slug}`}
                          >
                            {product.name}
                          </Link>
                        </figcaption>
                      </figure>
                    ) : (
                      <CanonicalProduct key={product.id} product={product} view={view} />
                    ),
                  )}
                </div>
                {!products.length ? <p>New pieces will appear here soon.</p> : null}
              </section>
            );
          })
        )}
        {!view.selectedProduct ? (
          <section className="shop-content-section">
            <h2>Make a connection</h2>
            <Contacts view={view} />
          </section>
        ) : null}
        <aside className="shop-contact-note">
          <p>This development mall uses fictional merchants. No payment is collected by Londos.</p>
          <p>
            Merchant terms apply to purchases and fulfilment. A contact action is not a confirmed
            sale.
          </p>
          {!view.privatePreview ? (
            <Link prefetch={false} href={`/report/${view.shop.id}`}>
              Report a concern about this shop
            </Link>
          ) : null}
        </aside>
      </div>
    </PilotObserver>
  );
}
